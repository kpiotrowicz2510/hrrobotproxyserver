var Swagger = require('swagger-client');
var open = require('open');
var rp = require('request-promise');

// config items
var pollInterval = 1000;
var globalConversationId = "";
var globalClient;
var directLineSecret = '0LRqFqrcrU0.cwA.ZFM.9TmbBrE5sHUw0HuULihitN5mLk3bflM3D-fDsu-wQAc';
var directLineClientName = 'DirectLineClient';
var directLineSpecUrl = 'https://docs.botframework.com/en-us/restapi/directline3/swagger.json';
var watermark = null;
var restify = require('restify');
function respond(req, res, next) {
  res.send('hello ' + req.params.name);
  next();
}
function respondMessage(req, res, next) {
    //res.send('sending ' + req.params.message);
    globalClient.Conversations.Conversations_PostActivity(
        {
            conversationId: globalConversationId,
            activity: {
                textFormat: 'plain',
                text: req.params.message,
                type: 'message',
                from: {
                    id: directLineClientName,
                    name: directLineClientName
                }
            }
        }).catch(function (err) {
            console.error('Error sending message:', err);
        }).then(function(){
           res.send(globalConversationId);
        });
        
            
    
  }
  function respondGetMessage(req, res, next){
    responseMessage = "";
    globalClient.Conversations.Conversations_GetActivities({ conversationId: req.params.convId, watermark: watermark })
        .then(function (response) {
            watermark = response.obj.watermark;     
            response.obj.activities = response.obj.activities.filter(function (m) { return m.from.id !== directLineClientName });
                    // use watermark so subsequent requests skip old messages 
            responseMessage = response.obj.activities;
        }).then(function(){
res.send(JSON.stringify(responseMessage));
next();
        })
  }
  function respondGetHistory(req, res, next){
    responseMessage = "";
    globalClient.Conversations.Conversations_GetActivities({ conversationId: req.params.convId, watermark: null })
        .then(function (response) {
            //watermark = response.obj.watermark;     
            //response.obj.activities = response.obj.activities.filter(function (m) { return m.from.id !== directLineClientName });
                    // use watermark so subsequent requests skip old messages 
            responseMessage = response.obj.activities;
        }).then(function(){
res.send(JSON.stringify(responseMessage));
next();
        })
  }
var server = restify.createServer();


const corsMiddleware = require('restify-cors-middleware')

const cors = corsMiddleware({
  preflightMaxAge: 5, //Optional
  origins: ['*'],
  allowHeaders: ['API-Token'],
  exposeHeaders: ['API-Token-Expiry']
})

server.pre(cors.preflight)
server.use(cors.actual)

server.get('/sendmessage/:message', respondMessage);
server.get('/getmessages/:convId', respondGetMessage);
server.get('/gethistory/:convId', respondGetHistory);
server.head('/hello/:name', respond);

server.listen(process.env.PORT || 9099, function() {
  console.log('%s listening at %s', server.name, server.url);
});


var directLineClient = rp(directLineSpecUrl)
    .then(function (spec) {
        // client
        return new Swagger({
            spec: JSON.parse(spec.trim()),
            usePromise: true
        });
    })
    .then(function (client) {
        // add authorization header to client
        client.clientAuthorizations.add('AuthorizationBotConnector', new Swagger.ApiKeyAuthorization('Authorization', 'Bearer ' + directLineSecret, 'header'));
        globalClient = client;
        return client;
    })
    .catch(function (err) {
        console.error('Error initializing DirectLine client', err);
    });

// once the client is ready, create a new conversation 
directLineClient.then(function (client) {
    client.Conversations.Conversations_StartConversation()                          // create conversation
        .then(function (response) {
            globalConversationId = response.obj.conversationId;
            return response.obj.conversationId;
        })                            // obtain id
        .then(function (conversationId) {
            sendMessagesFromConsole(client, conversationId);                        // start watching console input for sending new messages to bot
            pollMessages(client, conversationId);                                   // start polling messages from bot
        });
});

// Read from console (stdin) and send input to conversation using DirectLine client
function sendMessagesFromConsole(client, conversationId) {
    var stdin = process.openStdin();
    process.stdout.write('Command> ');
    stdin.addListener('data', function (e) {
        var input = e.toString().trim();
        if (input) {
            // exit
            if (input.toLowerCase() === 'exit') {
                return process.exit();
            }

            // send message
            client.Conversations.Conversations_PostActivity(
                {
                    conversationId: conversationId,
                    activity: {
                        textFormat: 'plain',
                        text: input,
                        type: 'message',
                        from: {
                            id: directLineClientName,
                            name: directLineClientName
                        }
                    }
                }).catch(function (err) {
                    console.error('Error sending message:', err);
                });

            process.stdout.write('Command> ');
        }
    });
}

// Poll Messages from conversation using DirectLine client
function pollMessages(client, conversationId) {
    console.log('Starting polling message for conversationId: ' + conversationId);
    var watermark = null;
    setInterval(function () {
        client.Conversations.Conversations_GetActivities({ conversationId: conversationId, watermark: watermark })
            .then(function (response) {
                watermark = response.obj.watermark;                                 // use watermark so subsequent requests skip old messages 
                return response.obj.activities;
            })
            .then(printMessages);
    }, pollInterval);
}

// Helpers methods
function printMessages(activities) {
    if (activities && activities.length) {
        // ignore own messages
        activities = activities.filter(function (m) { return m.from.id !== directLineClientName });

        if (activities.length) {
            process.stdout.clearLine();
            process.stdout.cursorTo(0);

            // print other messages
            activities.forEach(printMessage);

            process.stdout.write('Command> ');
        }
    }
}

function printMessage(activity) {
    console.log(activity.text);
    return;
    if (activity.text) {
        console.log(activity.text);
    }

    if (activity.attachments) {
        activity.attachments.forEach(function (attachment) {
            switch (attachment.contentType) {
                case "application/vnd.microsoft.card.hero":
                    renderHeroCard(attachment);
                    break;

                case "image/png":
                    console.log('Opening the requested image ' + attachment.contentUrl);
                    open(attachment.contentUrl);
                    break;
            }
        });
    }
}

function renderHeroCard(attachment) {
    var width = 70;
    var contentLine = function (content) {
        return ' '.repeat((width - content.length) / 2) +
            content +
            ' '.repeat((width - content.length) / 2);
    }

    console.log('/' + '*'.repeat(width + 1));
    console.log('*' + contentLine(attachment.content.title) + '*');
    console.log('*' + ' '.repeat(width) + '*');
    console.log('*' + contentLine(attachment.content.text) + '*');
    console.log('*'.repeat(width + 1) + '/');
}