################################################################################
# S3 Lifecycle — auto-delete compliance reports after 30 days
# Apply this to your compliance S3 bucket via Terraform / AWS CDK / Console
################################################################################

resource "aws_s3_bucket_lifecycle_configuration" "compliance_reports" {
  bucket = aws_s3_bucket.compliance.id

  rule {
    id     = "delete-compliance-reports-after-30-days"
    status = "Enabled"

    filter {
      tag {
        key   = "Category"
        value = "compliance-report"
      }
    }

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }
}

################################################################################
# Equivalent AWS CLI command (apply once during infra setup):
#
# aws s3api put-bucket-lifecycle-configuration \
#   --bucket YOUR_BUCKET_NAME \
#   --lifecycle-configuration '{
#     "Rules": [{
#       "ID": "delete-compliance-reports-after-30-days",
#       "Status": "Enabled",
#       "Filter": { "Tag": { "Key": "Category", "Value": "compliance-report" } },
#       "Expiration": { "Days": 30 }
#     }]
#   }'
################################################################################
