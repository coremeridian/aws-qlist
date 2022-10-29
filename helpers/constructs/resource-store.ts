import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

export default class ResourceStore extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
    }

    /**
     * Put a resource value in parameter store, so it can be consumed by other stacks in the app
     * @param resource: cdk.Construct that owns the parameter you want to store
     * @param value: string the value to store in parameter store
     */
    put(sourceStack: cdk.Stack, resource: Construct, value: string): void {
        new ssm.StringParameter(this, `${resource.node.id}-parameter`, {
            parameterName: `/cdk/${sourceStack.stackName}/${resource.node.id}`,
            stringValue: value,
        });
    }
    /**
     * Get a string value for a parameter stored by the persistent stack
     * @param sourceStack: the name of the stack that created the resource
     * @param resourceId: the `id` of the resource who's value you'd like to retrieve
     * @returns string the string value from the parameter store entry
     */
    getResource(sourceStack: string, resourceId: string): string {
        return ssm.StringParameter.valueForStringParameter(
            this,
            `/cdk/${sourceStack}/${resourceId}`
        );
    }
}
