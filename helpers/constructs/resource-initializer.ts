import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import {
    AwsCustomResource,
    AwsCustomResourcePolicy,
    AwsSdkCall,
    PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { createHash } from "crypto";

export interface CdkResourceInitializerProps {
    vpc: ec2.IVpc;
    subnetSelection: ec2.SubnetSelection;
    fnSecurityGroups: ec2.ISecurityGroup[];
    fnTimeout: cdk.Duration;
    fnCode: lambda.DockerImageCode;
    fnLogRetention: RetentionDays;
    fnMemorySize?: number;
    config: any;
}

export class CdkResourceInitializer extends Construct {
    public readonly response: string;
    public readonly customResource: AwsCustomResource;
    public readonly function: lambda.Function;

    constructor(
        scope: Construct,
        id: string,
        props: CdkResourceInitializerProps
    ) {
        super(scope, id);
        const stack = cdk.Stack.of(this);

        const fnSg = new ec2.SecurityGroup(this, "ResourceInitializerFnSg", {
            securityGroupName: `${id}ResourceInitializerFnSg`,
            vpc: props.vpc,
            allowAllOutbound: true,
        });

        const fn = new lambda.DockerImageFunction(
            this,
            "ResourceInitializerFn",
            {
                memorySize: props.fnMemorySize || 128,
                functionName: `${id}-ResInit${stack.stackName}`,
                code: props.fnCode,
                vpcSubnets: props.vpc.selectSubnets(props.subnetsSelection),
                vpc: props.vpc,
                securityGroups: [fnSg, ...props.fnSecurityGroups],
                timeout: props.fnTimeout,
                logRetention: props.fnLogRetention,
                allowAllOutbound: true,
            }
        );

        const payload: string = JSON.stringify({
            params: {
                config: props.config,
            },
        });

        const payloadHashPrefix = createHash("md5")
            .update(payload)
            .digest("hex")
            .substring(0, 6);

        const sdkCall: AwsSdkCall = {
            service: "Lambda",
            action: "invoke",
            parameters: {
                FunctionName: fn.functionName,
                Payload: payload,
            },
            physicalResourceId: PhysicalResourceId.of(
                `${id}-AwsSdkCall-${
                    fn.currentVersion.version + payloadHashPrefix
                }`
            ),
        };

        const customResourceFnRole = new iam.Role(
            this,
            "AwsCustomResourceRole",
            {
                assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            }
        );
        customResourceFnRole.addToPolicy(
            new iam.PolicyStatement({
                resources: [
                    `arn:aws:lambda:${stack.region}:${stack.account}:function:*-ResInit${stack.stackName}`,
                ],
                actions: ["lambda:InvokeFunction"],
            })
        );
        this.customResource = new AwsCustomResource(this, "AwsCustomResource", {
            policy: AwsCustomResourcePolicy.fromSdkCalls({
                resources: AwsCustomResourcePolicy.ANY_RESOURCE,
            }),
            onUpdate: sdkCall,
            timeout: cdk.Duration.minutes(10),
            role: customResourceFnRole,
        });

        this.response = this.customResource.getResponseField("Payload");

        this.function = fn;
    }
}
