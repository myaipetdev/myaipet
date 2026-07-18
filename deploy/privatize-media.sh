#!/usr/bin/env bash
# One-time/repair privacy migration for production media.
set -euo pipefail
umask 077

PETCLAW_MEDIA_PROVIDER="${STORAGE_PROVIDER:-local}"
PETCLAW_MEDIA_DIR="${LOCAL_UPLOAD_DIR:-/opt/petclaw/uploads}"
PETCLAW_MEDIA_BUCKET="${AWS_S3_BUCKET:-}"

if [[ "${PETCLAW_MEDIA_PROVIDER}" == "s3" ]]; then
  if [[ -z "${PETCLAW_MEDIA_BUCKET}" ]]; then
    echo "ERROR: AWS_S3_BUCKET is required for STORAGE_PROVIDER=s3." >&2
    exit 2
  fi
  aws s3api put-public-access-block \
    --bucket "${PETCLAW_MEDIA_BUCKET}" \
    --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  aws s3api delete-bucket-policy --bucket "${PETCLAW_MEDIA_BUCKET}" 2>/dev/null || true
  aws s3api put-bucket-ownership-controls \
    --bucket "${PETCLAW_MEDIA_BUCKET}" \
    --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
  aws s3api put-bucket-versioning \
    --bucket "${PETCLAW_MEDIA_BUCKET}" \
    --versioning-configuration Status=Enabled

  BLOCK_STATE="$(aws s3api get-public-access-block --bucket "${PETCLAW_MEDIA_BUCKET}" --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' --output text)"
  if [[ "${BLOCK_STATE}" != $'True\tTrue\tTrue\tTrue' ]]; then
    echo "ERROR: S3 public-access block verification failed." >&2
    exit 3
  fi
  echo "S3 media is private and versioned: ${PETCLAW_MEDIA_BUCKET}"
else
  if [[ ! -d "${PETCLAW_MEDIA_DIR}" || -L "${PETCLAW_MEDIA_DIR}" ]]; then
    echo "ERROR: local media directory is missing or a symlink: ${PETCLAW_MEDIA_DIR}" >&2
    exit 2
  fi
  find "${PETCLAW_MEDIA_DIR}" -type d -exec chmod 700 {} +
  find "${PETCLAW_MEDIA_DIR}" -type f -exec chmod 600 {} +
  echo "Local media permissions restricted. Nginx must proxy /uploads/ to Next.js; it must not use alias/root."
fi
