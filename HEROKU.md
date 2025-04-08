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

### 2. Configure environment variables

```bash
heroku config:set NODE_ENV=production
heroku config:set NPM_CONFIG_PRODUCTION=false
```

### 3. Deploy the application

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

### 4. Verify deployment

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

## Troubleshooting

1. **Connection issues**: Check your logs with `heroku logs --tail`
2. **Data loading issues**: Make sure the dataset file is properly included in your deployment
3. **Socket.io issues**: Make sure session affinity is enabled and check client-side connection settings

If you need to restart your application:

```bash
heroku restart
``` 