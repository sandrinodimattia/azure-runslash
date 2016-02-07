const azure = require('azure-storage');
const async = require('async');
const Promise = require('bluebird');
const logger = require('./logger');

module.exports = (accountName, accountKey, queueName) => {
  logger.info('Creating queue service for:', accountName);
  
  const queueService = azure.createQueueService(accountName, accountKey);
  
  const client = {
    create: () => {
      return new Promise((resolve, reject) => {
        try {
          queueService.createQueueIfNotExists(queueName, (err, res, response) => {
            if (err) {
              return reject(err);
            }
            return resolve();
          });
        } catch (e) {
          return reject(e);
        }
      });
    },
    
    send: (msg) => {   
      return new Promise((resolve, reject) => {
        try { 
          logger.debug('Sending message:', msg);
          
          queueService.createMessage(queueName, JSON.stringify(msg, null, 2), { messagettl: 240 * 60 }, (err) => {
            if (err) {
              return reject(err);
            }
            return resolve();
          });
        } catch (e) {
          return reject(e);
        }
      });
    },
    
    update: (msg, contents) => {
      return new Promise((resolve, reject) => {
        try { 
          logger.debug('Updating message:', msg);
          logger.debug(' > Contents:', contents);
          
          queueService.updateMessage(queueName, msg.messageid, msg.popreceipt, 5, { messageText: JSON.stringify(contents, null, 2) }, (err, res) => {
            if (err) {
              return reject(err);
            }
            return resolve();
          });
        } catch (e) {
          return reject(e);
        }
      });
      
    },
    
    delete: (msg) => {   
      return new Promise((resolve, reject) => {
        try { 
          logger.debug('Deleting message:', msg);
          
          queueService.deleteMessage(queueName, msg.messageid, msg.popreceipt, (err, res) => {
            if (err) {
              return reject(err);
            }
            return resolve();
          });
        } catch (e) {
          return reject(e);
        }
      });
    },
    
    getMessages: (messageCallback) => {  
      return new Promise((resolve, reject) => {
        try { 
          logger.debug('Getting messages...');
          
          queueService.getMessages(queueName, { numOfMessages: 15, visibilityTimeout: 5 }, (err, result, response) => {
            if (err) {
              return reject(err);
            }
            
            if (!result || !result.length) {
              return resolve();
            }
            
            logger.debug('Received:', result);
            
            async.each(result, messageCallback, (err) => {
              if (err) {
                return reject(err);
              }
              
              return resolve();
            });
          });
        } catch (e) {
          return reject(e);  
        }
      });
    },
    
    process: (messageCallback) => {
      return new Promise((resolve, reject) => {
        const processMessages = () => {
          client.getMessages(messageCallback)
            .delay(20 * 1000)
            .then(processMessages)
            .catch(reject);
        };
        processMessages();
      });
    }
  };
  return client;
};