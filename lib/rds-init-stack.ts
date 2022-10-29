import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { CdkResourceInitializer } from "../helpers/constructs/resource-initializer";
import { DockerImageCode } from "aws-cdk-lib/aws-lambda";
import { RetentionDays } from "aws-cdk-lib/aws-logs";

export default class RdsInitStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const instanceIdentifier = "postgresql-01";
        const credsSecretName =
            `/${id}/rds/creds/${instanceIdentifier}`.toLowerCase();
        const creds = new rds.DatabaseSecret(this, "PosgreSQLCredentials", {
            secretName: credsSecretName,
            username: "admin",
        });

        const vpc = new ec2.Vpc(this, "${id}/RDS/VPC", {
            natGatewayProvider: ec2.NatProvider.instance({
                instanceType: new ec2.InstanceType("t2.micro"),
            }),
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: "ingress",
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: "compute",
                    subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
                },
                {
                    cidrMask: 28,
                    name: "rds",
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                },
            ],
        });

        const dbServer = new rds.DatabaseInstance(this, "PostgreSQL", {
            vpcSubnets: {
                onePerAz: true,
                subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
            },
            credentials: rds.Credentials.fromSecret(creds),
            vpc: vpc,
            port: 3306,
            databaseName: "main",
            allocatedStorage: 20,
            instanceIdentifier,
            engine: rds.DatabaseInstanceEngine.postgres({
                version: rds.PostgresEngineVersion.VER_14,
            }),
            instanceType: ec2.InstanceType.of(
                ec2.InstanceClass.T3,
                ec2.InstanceSize.MICRO
            ),
        });

        // potentially allow connections to the RDS instance...
        // dbServer.connections.allowFrom ...

        const initializer = new CdkResourceInitializer(this, "MyRdsInit", {
            config: {
                credsSecretName,
            },
            fnLogRetention: RetentionDays.FIVE_MONTHS,
            fnCode: DockerImageCode.fromImageAsset(
                `${__dirname}../helpers/functions/rds-init`,
                {}
            ),
            fnTimeout: cdk.Duration.minutes(2),
            fnSecurityGroups: [],
            vpc,
            subnetSelection: vpc.selectSubnets({
                subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
            }),
        });
        // manage resources dependency
        initializer.customResource.node.addDependency(dbServer);

        dbServer.connections.allowFrom(
            initializer.function,
            ec2.Port.tcp(3306)
        );
        creds.grantRead(initializer.function);

        new cdk.CfnOutput(this, "RdsInitFnResponse", {
            value: cdk.Token.asString(initializer.response),
        });
    }
}
