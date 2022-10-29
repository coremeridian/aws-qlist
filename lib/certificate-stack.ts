import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ValidationMethod } from "aws-cdk-lib/aws-certificatemanager";
import * as cm from "aws-cdk-lib/aws-certificatemanager";
import { HostedZone } from 'aws-cdk-lib/aws-route53';

interface CertificateStackProps extends cdk.StackProps {
    domainName?: string
}

export default class CertificateStack extends cdk.Stack {
    readonly certificateArnCfn: cdk.CfnOutput;
    readonly domainName: string;

    constructor(scope: Construct, id: string, props?: CertificateStackProps) {
        super(scope, id, props);

        const hostedZone = HostedZone.fromLookup(this, "HostedZone", {
            domainName: "coremeridian.xyz",
            privateZone: false
        });

        this.domainName = props?.domainName ?? "qlist.coremeridian.xyz"
        const certificate = new cm.Certificate(this, "CustomDomainCertificate", {
            domainName: this.domainName,
            validation: cm.CertificateValidation.fromDns(hostedZone)
        });

        this.certificateArnCfn = new cdk.CfnOutput(this, "CertificateArn", {
            value: certificate.certificateArn
        });
    }
}
