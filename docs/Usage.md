# Backend Usage

The backend provides the API used by the BulkMailer frontend. Start the API first, then open the web application.

## Main workflow

1. Sign in through the frontend.
2. Create or import contacts.
3. Create a campaign with a subject, HTML content, and recipients.
4. Send immediately or schedule the campaign.
5. Monitor campaign status and delivery history from the dashboard.

## API base URL

Local development:

~~~text
http://localhost:5000/api
~~~

The API health endpoint is available at [http://localhost:5000/health](http://localhost:5000/health).

Authentication uses short-lived access tokens and HttpOnly refresh-token cookies. Use the forgot-password flow to recover an account password.

