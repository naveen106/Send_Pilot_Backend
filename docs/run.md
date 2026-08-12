# Run the Backend

## Start in development

From the backend repository root:

~~~bash
npm run dev
~~~

The API runs at [http://localhost:5000](http://localhost:5000).

Health check:

~~~text
GET http://localhost:5000/health
~~~

## Start in production mode

~~~bash
npm run build
npm start
~~~

## Start with Docker

~~~bash
docker build -t bulkmailer-backend .
docker run --rm -p 5000:5000 --env-file .env bulkmailer-backend
~~~

The container applies pending Prisma migrations before starting the API.

## Stop the server

- Press Ctrl+C in the terminal running the server.
- For a Docker container running in detached mode:

~~~bash
docker stop <container-name-or-id>
~~~

## Useful checks

~~~bash
npm run check
npm run prisma:studio
~~~

