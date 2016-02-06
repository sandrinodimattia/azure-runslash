const path = require('path');
const nconf = require('nconf');
const bodyParser = require('body-parser');
const uuid = require('node-uuid');
const morgan = require('morgan');
const Express = require('express');
const ArmClient = require('armclient');

const Queue = require('./lib/queue');
const logger = require('./lib/logger');

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

// Runbook queue.
const queue = Queue(nconf.get('STORAGE_ACCOUNT'), nconf.get('STORAGE_ACCOUNT_KEY'), 'azure-runslash-jobs');
queue.create()
  .catch((err) => { 
    throw err;
  });

// Helper method to execute a runbook.
const executeRunbook = (channel, requestedBy, name, params) => {
  const jobId = uuid.v4();
  const request = {
    properties: {
      runbook: {
        name
      },
      parameters: {
        context: JSON.stringify(params),
        MicrosoftApplicationManagementStartedBy: "\"azure-runslash\"",
        MicrosoftApplicationManagementRequestedBy: `\"${requestedBy}\"`
      }
    },
    tags: {}
  };
  
  return queue.send({ posted: new Date(), jobId: jobId, channel: channel, requestedBy: requestedBy, runbook: name })
    .then(() => {
      return armClient.provider(nconf.get('RESOURCE_GROUP'), 'Microsoft.Automation')
        .put(`/automationAccounts/${nconf.get('AUTOMATION_ACCOUNT')}/Jobs/${jobId}`, { 'api-version': '2015-10-31' }, request);
    });
};

// Initialize the app.
const app = new Express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(morgan(':method :url :status :response-time ms - :res[content-length]', {
  stream: logger.stream
}));
app.post('/execute', (req, res) => {
  if (!req.body) {
    return res.send(400);
  }
  
  if (req.body.token != nconf.get('SLACK_TOKEN')) {
    return res.status(401).send({ message: 'Invalid Slack token' });
  }
  
  // Runbook name is required.
  if (!req.body.text || req.body.text.length === 0) {
    return res.send({
      response_type: "in_channel",
      attachments: [{
        color: '#F35A00',
        fallback: `Unable to execute Azure Automation Runbook: The runbook name is required.`,
        text: `Unable to execute Azure Automation Runbook: The runbook name is required.`
      }]
    });
  }
  
  // Collect information.
  const input = req.body.text.trim().split(' ');
  const runbook = input[0];
  const params = input.splice(1);
  
  // Execute the runbook.
  executeRunbook(`#${req.body.channel_name}`, req.body.user_name, runbook, params)
    .then((data) => {
      const subscriptionsUrl = 'https://portal.azure.com/#resource/subscriptions';
      const runbookUrl = `${subscriptionsUrl}/${nconf.get('SUBSCRIPTION_ID')}/resourceGroups/${nconf.get('RESOURCE_GROUP')}/providers/Microsoft.Automation/automationAccounts/${nconf.get('AUTOMATION_ACCOUNT')}/runbooks/${runbook}`;
      
      res.send({
        response_type: 'in_channel',
        attachments: [{
          color: '#00BCF2',
          mrkdwn_in: ['text'],
          fallback: `Azure Automation Runbook ${runbook} has been queued.`,
          text: `Azure Automation Runbook *${runbook}* has been queued (<${runbookUrl}|Open Runbook>).`,
          fields: [
            { 'title': 'Automation Account', 'value': nconf.get('AUTOMATION_ACCOUNT'), 'short': true },
            { 'title': 'Runbook', 'value': runbook, 'short': true },
            { 'title': 'Job ID', 'value': data.body.properties.jobId, 'short': true },
            { 'title': 'Parameters', 'value': `"${params.join('", "')}"`, 'short': true },
          ],
        }]
      });
    })
    .catch((err) => {
      if (err) {
        logger.error(err);  
      }
      
      res.send({
        response_type: 'in_channel',
        attachments: [{
          color: '#F35A00',
          fallback: `Unable to execute Azure Automation Runbook: ${err.message || err.details && err.details.message || err.status}.`,
          text: `Unable to execute Azure Automation Runbook: ${err.message || err.details && err.details.message || err.status}.`
        }]
      });
    });
})

// Start the server.
app.listen(nconf.get('PORT'), (error) => {
  if (error) {
    logger.error(error);
  } else {
    logger.info('Listening on http://localhost:' + nconf.get('PORT'));
  }
});