#!/bin/bash
set -e

# ── PetClaw AWS Infrastructure Setup ──
# Run once to create all required AWS resources

REGION="ap-northeast-2"
PROJECT="petclaw"

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
aws s3 mb s3://${PROJECT}-uploads --region ${REGION} 2>/dev/null || echo "  (already exists)"
aws s3api put-public-access-block \
  --bucket ${PROJECT}-uploads \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
  2>/dev/null
aws s3api put-bucket-policy \
  --bucket ${PROJECT}-uploads \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Sid": "PublicRead",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::'"${PROJECT}"'-uploads/uploads/*"
    }]
  }' 2>/dev/null
echo "  S3 bucket: ${PROJECT}-uploads"

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
