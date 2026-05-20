#!/bin/bash
# Provision AWS RDS PostgreSQL for PetClaw.
#
# Defaults are right-sized for current load (~100 daily active pets, sub-50ms
# query latency target). Adjust DB_INSTANCE_CLASS / ALLOCATED_STORAGE later
# as you grow — db.t4g.micro is ~$13/mo on-demand, plus storage.
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - VPC + subnets + security group accessible to your EC2 instance
#
# Run:
#   bash deploy/setup-rds.sh

set -euo pipefail

REGION="${REGION:-ap-northeast-2}"
PROJECT="${PROJECT:-petclaw}"
DB_INSTANCE_ID="${DB_INSTANCE_ID:-${PROJECT}-db}"
DB_NAME="${DB_NAME:-petclaw}"
DB_USER="${DB_USER:-petclaw_admin}"
DB_INSTANCE_CLASS="${DB_INSTANCE_CLASS:-db.t4g.micro}"   # cheapest ARM Graviton
ALLOCATED_STORAGE="${ALLOCATED_STORAGE:-20}"             # GB, gp3
ENGINE_VERSION="${ENGINE_VERSION:-17.4}"                 # latest PG 17 GA
BACKUP_RETENTION="${BACKUP_RETENTION:-7}"                # days
DB_SUBNET_GROUP="${DB_SUBNET_GROUP:-}"                   # optional override
VPC_SECURITY_GROUP_IDS="${VPC_SECURITY_GROUP_IDS:-}"     # required: sg-xxx,sg-yyy

if [ -z "${VPC_SECURITY_GROUP_IDS}" ]; then
  echo "ERROR: export VPC_SECURITY_GROUP_IDS=sg-xxxxxxxx (the SG attached to your EC2 instance, so RDS accepts connections from it)"
  echo ""
  echo "Find it with: aws ec2 describe-instances --region ${REGION} --query 'Reservations[].Instances[].SecurityGroups[*]'"
  exit 1
fi

# Generate strong password (32 chars, alphanumeric — RDS rejects some specials)
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)}"

echo "═══════════════════════════════════"
echo "  PetClaw RDS provisioning"
echo "  Region:      ${REGION}"
echo "  Instance:    ${DB_INSTANCE_ID} (${DB_INSTANCE_CLASS})"
echo "  Engine:      postgres ${ENGINE_VERSION}"
echo "  Storage:     ${ALLOCATED_STORAGE}GB gp3"
echo "  DB name:     ${DB_NAME}"
echo "  Admin user:  ${DB_USER}"
echo "═══════════════════════════════════"
echo ""
echo "Password will be saved to: ./.rds-password.txt (move it somewhere safe afterwards)"
echo "${DB_PASSWORD}" > ./.rds-password.txt
chmod 600 ./.rds-password.txt
echo ""

# Build subnet-group arg if provided
SUBNET_ARG=""
if [ -n "${DB_SUBNET_GROUP}" ]; then
  SUBNET_ARG="--db-subnet-group-name ${DB_SUBNET_GROUP}"
fi

aws rds create-db-instance \
  --region "${REGION}" \
  --db-instance-identifier "${DB_INSTANCE_ID}" \
  --db-instance-class "${DB_INSTANCE_CLASS}" \
  --engine postgres \
  --engine-version "${ENGINE_VERSION}" \
  --allocated-storage "${ALLOCATED_STORAGE}" \
  --storage-type gp3 \
  --master-username "${DB_USER}" \
  --master-user-password "${DB_PASSWORD}" \
  --db-name "${DB_NAME}" \
  --vpc-security-group-ids ${VPC_SECURITY_GROUP_IDS//,/ } \
  --backup-retention-period "${BACKUP_RETENTION}" \
  --no-publicly-accessible \
  --storage-encrypted \
  --auto-minor-version-upgrade \
  --copy-tags-to-snapshot \
  ${SUBNET_ARG} \
  --tags "Key=Project,Value=${PROJECT}" \
  2>&1 | head -40

echo ""
echo "→ Waiting for RDS instance to become available (this takes 5-10 min)..."
aws rds wait db-instance-available \
  --region "${REGION}" \
  --db-instance-identifier "${DB_INSTANCE_ID}"

ENDPOINT=$(aws rds describe-db-instances \
  --region "${REGION}" \
  --db-instance-identifier "${DB_INSTANCE_ID}" \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

PORT=$(aws rds describe-db-instances \
  --region "${REGION}" \
  --db-instance-identifier "${DB_INSTANCE_ID}" \
  --query 'DBInstances[0].Endpoint.Port' \
  --output text)

echo ""
echo "═══════════════════════════════════"
echo "  ✅ RDS ready"
echo ""
echo "  DATABASE_URL=postgresql://${DB_USER}:<password>@${ENDPOINT}:${PORT}/${DB_NAME}?schema=public&sslmode=require"
echo ""
echo "  Password is in ./.rds-password.txt"
echo "  Move it to AWS Secrets Manager or your .env on EC2:"
echo ""
echo "    aws secretsmanager create-secret \\"
echo "      --name ${PROJECT}/database-url \\"
echo "      --secret-string \"postgresql://${DB_USER}:\$(cat .rds-password.txt)@${ENDPOINT}:${PORT}/${DB_NAME}?schema=public&sslmode=require\" \\"
echo "      --region ${REGION}"
echo ""
echo "  Then migrate data: bash deploy/migrate-neon-to-rds.sh"
echo "═══════════════════════════════════"
