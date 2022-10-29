FROM amazon/aws-lambda-nodejs:14
WORKDIR .

COPY package.json ./
RUN npm install --only=production
COPY index.js ./

CMD [ "index.handler" ]
