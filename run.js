const nconf = require('nconf');
const request = require('request');
const bodyParser = require('body-parser');
const ArmClient = require('armclient');
const Slack = require('node-slackr');

const Queue = require('./lib/queue');

const logger = require('./lib/logger');
logger.info('Starting azure-runslash worker process.');

// Initialize configuration.
nconf.argv()
  .env()
  .file({ file: './config.json' })
  .defaults({
    NODE_ENV: 'development',
    PORT: 3500
  });

// ARM client.
const armClient = ArmClient({ 
  subscriptionId: nconf.get('SUBSCRIPTION_ID'),
  auth: ArmClient.clientCredentials({
    tenantId: nconf.get('TENANT_ID'), 
    clientId: nconf.get('CLIENT_ID'),
    clientSecret: nconf.get('CLIENT_SECRET')
  })
});

// Slack client.
const slack = new Slack(nconf.get('SLACK_INCOMING_WEBHOOK_URL'), {
  channel: nconf.get('SLACK_CHANNEL')
});

// Queue.
const queue = Queue(nconf.get('STORAGE_ACCOUNT'), nconf.get('STORAGE_ACCOUNT_KEY'), 'azure-runslash-jobs');

// Worker code.
const worker = (message, cb) => {
  var job = JSON.parse(message.messagetext);
  
  logger.info('Processing job:', JSON.stringify(job, null, 2));
  
  armClient.provider(nconf.get('RESOURCE_GROUP'), 'Microsoft.Automation')
    .get(`/automationAccounts/${nconf.get('AUTOMATION_ACCOUNT')}/Jobs/${job.jobId}`, { 'api-version': '2015-10-31' })
    .then((res) => {
      return {
        status: res.body.properties.status,
        provisioningState: res.body.properties.provisioningState
      };
    })
    .then((currentJob) => {
      // The job hasn't changed.
      if (job.status === currentJob.status) {
        return cb();
      }
      
      // Update the current job.
      job.status = currentJob.status;
      job.provisioningState = currentJob.provisioningState;
      
      // Post an update to Slack.
      postToSlack(job);
      
      // We need to keep monitoring this job for updates.
      if (job.status !== 'Completed' && job.status !== 'Failed') {
        return queue.update(message, job)
          .then(cb)
          .catch(cb);
      }
      
      // Job will not receive any more updates, let's stop here.
      return queue.delete(message)
        .then(cb)
        .catch(cb);
    })
    .catch((err) => {
      logger.error(err);
      cb();
    });
}; 

// Post the message to slack.
const postToSlack = (job) => {
  var color;
  var message;
  
  switch (job.status) {
    case 'New':
      return;
    case 'Activating':
      message = `On your marks... Job ${job.jobId} is being activated!`;
      color = '#95A5A6';
      break;
    case 'Running':
      message = `Finally! Job ${job.jobId}  is running!`;
      color = '#95A5A6';
      break;
    case 'Completed':
      message = `Success! Job ${job.jobId}  completed!`;
      color = '#7CD197';
      break;
    case 'Failed':
      message = `Oops! Job ${job.jobId} failed!`;
      color = '#F35A00';
      break;
  }

  const subscriptionsUrl = 'https://portal.azure.com/#resource/subscriptions';
  const runbookUrl = `${subscriptionsUrl}/${nconf.get('SUBSCRIPTION_ID')}/resourceGroups/${nconf.get('RESOURCE_GROUP')}/providers/Microsoft.Automation/automationAccounts/${nconf.get('AUTOMATION_ACCOUNT')}/runbooks/${job.runbook}`;
  
  var msg = {
    attachments: [{
      color: color,
      fallback: message,
      mrkdwn_in: ['text'],
      text: `Status update for job '${job.jobId}' (<${runbookUrl}|Open Runbook>).`,
      fields: [
        { 'title': 'Automation Account', 'value': nconf.get('AUTOMATION_ACCOUNT'), 'short': true },
        { 'title': 'Runbook', 'value': job.runbook, 'short': true },
        { 'title': 'Job ID', 'value': job.jobId, 'short': true },
        { 'title': 'Status', 'value': job.status, 'short': true },
      ]
    }]
  };

  slack.notify(msg, (err, result) => {
    if (err) {
      logger.error('Error posting to Slack:', err);
    }

    logger.debug('Update posted to Slack.');
  });
};
 
// Start listening.
queue.create()
  .then(() => {
    logger.debug(`Listening for messages in ${nconf.get('STORAGE_ACCOUNT')}/azure-runslash-jobs.`);
    return queue.process(worker);
  })
  .catch((err) => { 
    logger.error(err);
    throw err;
  });