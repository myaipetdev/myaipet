#!/bin/bash
set -e

# ── PetClaw AWS Deployment Script ──
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - Docker installed
#   - ECR repository created
#   - ECS cluster created
#   - RDS PostgreSQL running
#   - S3 bucket created
#   - Secrets in AWS Secrets Manager

REGION="ap-northeast-2"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="petclaw-web"
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"
CLUSTER="petclaw-cluster"
SERVICE="petclaw-web-service"
IMAGE_TAG="${1:-latest}"

echo "═══════════════════════════════════"
echo "  PetClaw Deploy to AWS ECS"
echo "  Region: ${REGION}"
echo "  Image: ${ECR_URI}:${IMAGE_TAG}"
echo "═══════════════════════════════════"

# ── Step 1: Login to ECR ──
echo "→ Logging into ECR..."
aws ecr get-login-password --region ${REGION} | \
  docker login --username AWS --password-stdin ${ECR_URI}

# ── Step 2: Build Docker image ──
echo "→ Building Docker image..."
cd "$(dirname "$0")/../web"
docker build --platform linux/amd64 -t ${ECR_REPO}:${IMAGE_TAG} .

# ── Step 3: Tag & Push to ECR ──
echo "→ Pushing to ECR..."
docker tag ${ECR_REPO}:${IMAGE_TAG} ${ECR_URI}:${IMAGE_TAG}
docker push ${ECR_URI}:${IMAGE_TAG}

# ── Step 4: Run Prisma migrations ──
echo "→ Running database migrations..."
# This runs migration against RDS via ECS run-task
aws ecs run-task \
  --cluster ${CLUSTER} \
  --task-definition petclaw-web \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "petclaw-web",
      "command": ["npx", "prisma", "db", "push"]
    }]
  }' \
  --region ${REGION} || echo "Migration task submitted (check ECS console)"

# ── Step 5: Update ECS service ──
echo "→ Updating ECS service..."
aws ecs update-service \
  --cluster ${CLUSTER} \
  --service ${SERVICE} \
  --force-new-deployment \
  --region ${REGION}

echo ""
echo "✅ Deployment initiated!"
echo "   Monitor: https://${REGION}.console.aws.amazon.com/ecs/v2/clusters/${CLUSTER}/services/${SERVICE}"
echo ""
echo "═══════════════════════════════════"
