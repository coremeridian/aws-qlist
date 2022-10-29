import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { OriginAccessIdentity } from "aws-cdk-lib/aws-cloudfront";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";

interface S3BucketCfnStackProps extends cdk.StackProps {
    bucketName?: string;
}

export class S3BucketCfnStack extends cdk.Stack {
    readonly bucket: s3.Bucket;
    readonly cloudfrontOAI: OriginAccessIdentity;

    constructor(scope: Construct, id: string, props?: S3BucketCfnStackProps) {
        super(scope, id, props);

        const name = props?.bucketName ?? id;
        this.bucket = new s3.Bucket(this, id, {
            bucketName: name,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            websiteIndexDocument: "index.html",
            websiteErrorDocument: "error.html",
            publicReadAccess: false,
            autoDeleteObjects: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            lifecycleRules: [
                {
                    id: "cleanup",
                    enabled: true,
                    noncurrentVersionExpiration: cdk.Duration.days(1),
                    noncurrentVersionsToRetain: 1,
                },
            ],
        });
        new cdk.CfnOutput(this, "Bucket", { value: this.bucket.bucketName });

        this.cloudfrontOAI = new OriginAccessIdentity(this, `oia-${id}`, {
            comment: "OAI for web app",
        });

        this.bucket.grantRead(this.cloudfrontOAI);
    }
}
