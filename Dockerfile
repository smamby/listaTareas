FROM node:18

WORKDIR /app

COPY PACKAGE*.JSON ./

RUN npm install

COPY . .

EXPOSE 3000

CMD [ "npm" , "start" ]
