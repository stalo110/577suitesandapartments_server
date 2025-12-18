"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invokeLambda = void 0;
const client_lambda_1 = require("@aws-sdk/client-lambda");
const client_lambda_2 = require("@aws-sdk/client-lambda");
const lambda = new client_lambda_2.LambdaClient({
    region: process.env.AWS_REGION || "us-east-2",
});
const invokeLambda = async (functionName, payload, asyncInvoke = false) => {
    const params = {
        FunctionName: functionName,
        InvocationType: asyncInvoke ? client_lambda_1.InvocationType.Event : client_lambda_1.InvocationType.RequestResponse,
        Payload: Buffer.from(JSON.stringify(payload)),
    };
    const command = new client_lambda_1.InvokeCommand(params);
    const response = await lambda.send(command);
    if (!response.Payload) {
        return {};
    }
    const responseStr = Buffer.from(response.Payload).toString().trim();
    if (!responseStr) {
        return {};
    }
    try {
        return JSON.parse(responseStr);
    }
    catch (err) {
        console.error("Failed to parse Lambda response:", responseStr);
        throw err;
    }
};
exports.invokeLambda = invokeLambda;
