const { Client } = require("pg");
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");

const secrets = new AWS.SecretsManager({});

exports.handler = async (e) => {
    try {
        const { config } = e.params;
        const { password, username, host } = await getSecretValue(
            config.credsSecretName
        );
        const client = new Client({
            user: username,
            password,
            host,
        });

        await client.connect();

        const sqlScript = fs
            .readFileSync(path.join(__dirname, "script.sql"))
            .toString();

        await query(client, sqlScript);
        await client.end();

        return {
            status: "OK",
        };
    } catch (err) {
        return {
            status: "ERROR",
            err,
            message: err.message,
        };
    }
};

const query = (client, sql) => {
    return new Promise((resolve, reject) => {
        client.query(sql, (err, res) => {
            if (err) return reject(err);
            return resolve(res);
        });
    });
};

const getSecretValue = (secretId) => {
    return new Promise((resolve, reject) => {
        secrets.getSecretValue({ SecretId: secretId }, (err, data) => {
            if (err) return reject(err);

            return resolve(JSON.parse(data.SecretString));
        });
    });
};
