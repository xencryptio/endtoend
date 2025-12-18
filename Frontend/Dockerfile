FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Force unbuffered logs
ENV FORCE_COLOR=1
ENV NODE_ENV=development

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080", "--clearScreen=false"]
