#!/usr/bin/env bash
set -euo pipefail
umask 077

# ── PetClaw AWS Infrastructure Setup ──
# Run once to create all required AWS resources

REGION="${AWS_REGION:-ap-northeast-2}"
PROJECT="${PETCLAW_PROJECT:-petclaw}"
UPLOAD_BUCKET="${PETCLAW_UPLOAD_BUCKET:-${PROJECT}-uploads}"

echo "═══════════════════════════════════"
echo "  PetClaw AWS Setup"
echo "  Region: ${REGION}"
echo "═══════════════════════════════════"

# ── 1. ECR Repository ──
echo "→ Creating ECR repository..."
aws ecr create-repository \
  --repository-name ${PROJECT}-web \
  --region ${REGION} \
  --image-scanning-configuration scanOnPush=true \
  2>/dev/null || echo "  (already exists)"

# ── 2. S3 Bucket ──
echo "→ Creating S3 bucket..."
aws s3 mb "s3://${UPLOAD_BUCKET}" --region "${REGION}" 2>/dev/null || echo "  (already exists)"
# Private by default. All browser reads are mediated by /api/media/* and the
# app's owner/public-consent checks; providers receive short-lived presigned URLs.
aws s3api put-public-access-block \
  --bucket "${UPLOAD_BUCKET}" \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
aws s3api delete-bucket-policy --bucket "${UPLOAD_BUCKET}" 2>/dev/null || true
aws s3api put-bucket-ownership-controls \
  --bucket "${UPLOAD_BUCKET}" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api put-bucket-encryption \
  --bucket "${UPLOAD_BUCKET}" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-versioning \
  --bucket "${UPLOAD_BUCKET}" \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-lifecycle-configuration \
  --bucket "${UPLOAD_BUCKET}" \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "retain-recoverable-versions",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "NoncurrentVersionTransitions": [{"NoncurrentDays": 30, "StorageClass": "STANDARD_IA"}],
      "NoncurrentVersionExpiration": {"NoncurrentDays": 90},
      "Expiration": {"ExpiredObjectDeleteMarker": true},
      "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
    }]
  }'
echo "  Private, versioned S3 bucket: ${UPLOAD_BUCKET}"

# ── 3. ECS Cluster ──
echo "→ Creating ECS cluster..."
aws ecs create-cluster \
  --cluster-name ${PROJECT}-cluster \
  --region ${REGION} \
  2>/dev/null || echo "  (already exists)"

# ── 4. CloudWatch Log Group ──
echo "→ Creating log group..."
aws logs create-log-group \
  --log-group-name /ecs/${PROJECT}-web \
  --region ${REGION} \
  2>/dev/null || echo "  (already exists)"

# ── 5. Secrets Manager ──
echo "→ Setting up secrets (fill in values)..."
echo "  Run these manually with your actual values:"
echo ""
echo "  aws secretsmanager create-secret --name ${PROJECT}/database-url --secret-string 'postgresql://...' --region ${REGION}"
echo "  aws secretsmanager create-secret --name ${PROJECT}/grok-api-key --secret-string 'xai-...' --region ${REGION}"
echo "  aws secretsmanager create-secret --name ${PROJECT}/openai-api-key --secret-string 'sk-...' --region ${REGION}"
echo "  aws secretsmanager create-secret --name ${PROJECT}/jwt-secret --secret-string '$(openssl rand -hex 32)' --region ${REGION}"
echo "  aws secretsmanager create-secret --name ${PROJECT}/fal-api-key --secret-string '...' --region ${REGION}"
echo "  aws secretsmanager create-secret --name ${PROJECT}/agent-encryption-key --secret-string '$(openssl rand -hex 32)' --region ${REGION}"

echo ""
echo "═══════════════════════════════════"
echo "  ✅ Infrastructure ready!"
echo ""
echo "  Next steps:"
echo "  1. Create RDS PostgreSQL instance (aws rds create-db-instance)"
echo "  2. Fill in secrets (commands above)"
echo "  3. Update deploy/ecs-task-definition.json with subnet/security group IDs"
echo "  4. Register task definition: aws ecs register-task-definition --cli-input-json file://deploy/ecs-task-definition.json"
echo "  5. Create service: aws ecs create-service --cluster ${PROJECT}-cluster --service-name ${PROJECT}-web-service --task-definition ${PROJECT}-web --desired-count 1 --launch-type FARGATE --network-configuration ..."
echo "  6. Deploy: ./deploy/deploy.sh"
echo "═══════════════════════════════════"
