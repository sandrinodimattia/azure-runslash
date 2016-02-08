# azure-runslash

**azure-runslash** is a ChatOps tool that allows you to deploy and manage complete environments in Azure using Slack.

![ChatOps with Slack](http://fabriccontroller.net/static/chatops-runbook-status.png)

To get started read the **Configuration** section here and then click this button:

[![Deploy to Azure](http://azuredeploy.net/deploybutton.png)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fsandrinodimattia%2Fazure-runslash%2Fmaster%2Fazuredeploy.json)

## So how does this work?

Well the Slash command will just forward the request to a Web App. This Web App will call the Resource Manager API to execute the Runbook and then also post a message to a queue (containing the Job ID).

A Web Job will then empty the queue and post a message to Slack each time the status of the job changes.

![How does this work?](http://fabriccontroller.net/static/static/chatops-how-this-works.png)

## Configuration

### Azure Automation

This integration will execute Runbooks in your Azure Automation account. So this is a first pre-requisites. If you're new to Azure Automation you can start with the [documentation](https://azure.microsoft.com/en-us/documentation/articles/automation-configuring/) and a sample runbook is available [here](https://github.com/sandrinodimattia/advanced-azure-automation-webhooks-webtask#prerequisites).

> Important: the Slash command will send 1 parameter to the Runbook, `$context`. This will contain an array of all the values you specify when invoking the command. Eg: `/runbook Sample-Runbook a b c` will end up being `["a", "b", "c"]`. In your runbook you would specify the parameter like this: `param ([Parameter(Mandatory=$false)][object]$context)`.

Now write down the `Resource Group` and `Automation Account Name` because this will be something you'll need when deploying the integration.

## Azure AD Authentication

The code running when your Slash command executes will need to authenticate to the Resource Manager API. There are [different tutorials available](https://azure.microsoft.com/en-us/documentation/articles/resource-group-authenticate-service-principal/) that explain how you can create an application in Azure AD that will be able to access your subscription.

There's also a [blog post](http://fabriccontroller.net/using-adal-and-the-azure-resource-manager-rest-api-from-within-a-webtask/) on my blog that shows how to do this with the `azure-cli`.

Now write down the `Tenant ID`, `Subscription ID`, `Client ID` and `Client Secret` because this will be something you'll need when deploying the integration.

## Slack Configuration

In Slack you'll need to configure a Slash command. Thing's you'll want to set here:

 - `Command`: This is what will trigger the integration.
 - `URL`: This is the url on which you'll host the integration. Make sure you add `/execute` after it.
 - `Customize Name/Icon`: Make it look nice! 

Now write down the `Token` because this will be something you'll need when deploying the integration.

![Slash Command](http://fabriccontroller.net/static/chatops-slash-command.png)

And in order for the integration to report back you'll also need to create an Incoming Web Hook. Here you'll configure:

 - `Post to Channel`: This is the channel to which you'll want the updates to be posted.
 - `Customize Name/Icon`: Make it look nice! 

Now write down the `Channel Name` and `Webhook URL` because this will be something you'll need when deploying the integration.

![Incoming Web Hook](http://fabriccontroller.net/static/chatops-incoming-webhook.png)

## Deployment

If you click the following button this will start the deployment of a Resource Manager template:

[![Deploy to Azure](http://azuredeploy.net/deploybutton.png)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fsandrinodimattia%2Fazure-runslash%2Fmaster%2Fazuredeploy.json)

This template will do all of the configuration for you and just ask you for your settings:

![Resource Manager Settings](http://fabriccontroller.net/static/chatops-settings.png)

> Important: Enter the name of the App Service Plan and Storage Account you want to use. If these don't exist they will be created automatically. If they do exist, make sure you enter the **existing settings** in SKU/Plan Size/Worker Size/Account Type.

And ow just accept the terms and press **Create**!

![Deploying...](http://fabriccontroller.net/static/chatops-deployment.png)

Give it between 15 and 30 minutes. The last step in the deployment can take some time because it needs to install the NPM dependencies.

## FAQ

### Why should I still run all of this myself? Why not create a Slack App.

Well yes maybe that's a next step. The thing to worry about in that case is how to keep your credentials secure. In the current setup you own everything. A third party does not have access to your Azure subscription.

### Why would I want to use this?

Maybe to make manual tasks easier. I'm not saying you have to do all of your production stuff with Slack. But for us it makes sense to automate tasks regarding our test environment. Start a SharePoint cluster, stop it, restore a backup, ... If we can automate all of this using a Runbook and expose it over a Slash command it will be much more accessible to everyone (even for people without access to the Azure subscription).

### The first time I call the Slash command it tells me there was a timeout

Slack expects a quick reply from the service it calls. Sometimes an Azure Web app can take a few seconds to start. Now even if you get a timeout, the Runbook will still execute and the status will still be posted to Slack.
