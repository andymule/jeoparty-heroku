# Deploying Jeoparty to Heroku

This guide provides detailed instructions for deploying the Jeoparty application to Heroku.

## Prerequisites

1. Create a [Heroku account](https://signup.heroku.com/)
2. Install the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
3. Log in to Heroku: `heroku login`

## Deployment Steps

### 1. Create a new Heroku app

```bash
heroku create jeoparty-app
```

Replace `jeoparty-app` with your preferred app name.

### 2. Add PostgreSQL database

```bash
heroku addons:create heroku-postgresql:hobby-dev
```

This creates a free PostgreSQL database for your application.

### 3. Configure environment variables

```bash
heroku config:set NODE_ENV=production
heroku config:set NPM_CONFIG_PRODUCTION=false
```

### 4. Deploy the application

Commit all your changes, then push to Heroku:

```bash
git add .
git commit -m "Initial deployment"
git push heroku main
```

If your main branch is named differently (e.g., `master`), use:

```bash
git push heroku master
```

### 5. Import the Jeopardy questions dataset

First, download the [Jeopardy dataset](https://github.com/jwolle1/jeopardy_clue_dataset) if you haven't already.

Then, set up the database tables:

```bash
heroku run node server/scripts/import-data.js
```

Alternatively, if you want to import the full dataset:

1. Install the [Heroku PostgreSQL Import/Export](https://devcenter.heroku.com/articles/heroku-postgres-import-export) tools
2. Convert the TSV file to a PostgreSQL-compatible format
3. Import the data:

```bash
heroku pg:psql < jeopardy_questions.sql
```

### 6. Verify deployment

Open your application in a browser:

```bash
heroku open
```

## Scaling and Monitoring

### Scaling dynos

```bash
# Scale to a more powerful dyno (costs apply)
heroku ps:scale web=1:standard-1x

# Scale back to free tier (if available)
heroku ps:scale web=1:free
```

### Enable WebSocket support

If you encounter issues with real-time features, make sure session affinity is enabled:

```bash
heroku features:enable http-session-affinity
```

### Monitoring

View application logs:

```bash
heroku logs --tail
```

## Database Management

Connect to the PostgreSQL database:

```bash
heroku pg:psql
```

View database information:

```bash
heroku pg:info
```

## Troubleshooting

1. **Connection issues**: Check your logs with `heroku logs --tail`
2. **Database issues**: Ensure tables were created properly with `heroku pg:psql` and running `\dt`
3. **Socket.io issues**: Make sure session affinity is enabled and check client-side connection settings

If you need to restart your application:

```bash
heroku restart
``` 