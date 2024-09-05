'use strict'

require('dotenv').config();

//--- for Vonage Cloud Runtime installation ----
const neruHost = process.env.NERU_HOST;
console.log('neruHost:', neruHost);

const express = require('express');
const bodyParser = require('body-parser')
const app = express();
app.use(bodyParser.json());

const dfConnectorServer = process.env.DF_CONNECTOR_SERVER;

const servicePhoneNumber = process.env.SERVICE_PHONE_NUMBER;
console.log ("Service number:", servicePhoneNumber);

// ---- CORS policy - update to your requirements

// app.use(function (req, res, next) {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//   res.header("Access-Control-Allow-Methods", "OPTIONS,GET,POST,PUT,DELETE");
//   res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
//   next();
// });

//---------------------------

//--- Vonage API ---

const { Auth } = require('@vonage/auth');

const credentials = new Auth({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  applicationId: process.env.APP_ID,
  privateKey: './.private.key'    // private key file name with a leading dot 
});

const apiBaseUrl = "https://" + process.env.API_REGION;

const options = {
  apiHost: apiBaseUrl
};

const { Vonage } = require('@vonage/server-sdk');

const vonage = new Vonage(credentials, options);

//==========================================================

app.get('/answer', (req, res) => {

  const uuid = req.query.uuid;

  app.set('call_type_' + uuid, "not_websocket"); // info will be used to start a websocket after transfer of this call leg to conference

  const nccoResponse = [
    {
      "action":"talk",
      "text":"Connecting your call, please wait.",
      "language": "en-US",
      "style": 11   // See https://developer.nexmo.com/voice/voice-api/guides/text-to-speech
    },
    {
      "action": "conversation",
      "endOnExit": true,  // So the WebSocket will be automatically terminated when this call leg ends
      "name": "conference_" + req.query.uuid
    }
  ];

  res.status(200).json(nccoResponse);

});

//---------

app.post('/event', (req, res) => {

  const uuid = req.body.uuid;

  //--

  if (req.body.type == 'transfer'){

    if ( app.get('call_type_' + uuid) == "not_websocket") {

      const hostName = `${req.hostname}`;
    
      // vonage.calls.create({
      //   to: [{
      //     'type': 'websocket',
      //     'uri': 'wss://' + dfConnectorServer + '/socket?original_uuid=' + uuid + '&webhook_url=https://' + hostName + '/analytics',
      //     'content-type': 'audio/l16;rate=16000',
      //     'headers': {}
      //   }],
      //   from: {
      //     type: 'phone',
      //     number: serviceNumber
      //   },
      //   answer_url: ['https://' + hostName + '/ws_answer?original_uuid=' + uuid],
      //   answer_method: 'GET',
      //   event_url: ['https://' + hostName + '/ws_event?original_uuid=' + uuid],
      //   event_method: 'POST'
      //   }, (err, res) => {
      //   if (err) {
      //     console.error(">>> WebSocket create error:", err);
      //     console.error(err.body.title);
      //     console.error(err.body.invalid_parameters);
      //   }
      //   else { console.log(">>> WebSocket create status:", res); }
      // });

      vonage.voice.createOutboundCall({
        to: [{
          'type': 'websocket',
          'uri': 'wss://' + dfConnectorServer + '/socket?original_uuid=' + uuid + '&webhook_url=https://' + hostName + '/analytics',
          'content-type': 'audio/l16;rate=16000',  // NEVER change the content-type parameter argument
          'headers': {}
        }],
        from: {
          type: 'phone',
          number: servicePhoneNumber // placeholder value, value does not matter, cannot use a longer than 15-digit string
        },
        answer_url: ['https://' + hostName + '/ws_answer?original_uuid=' + uuid],
        answer_method: 'GET',
        event_url: ['https://' + hostName + '/ws_event?original_uuid=' + uuid],
        event_method: 'POST'
        })
        .then(res => {
          console.log(">>> WebSocket create status:", res);
        })
        .catch(err => console.error(">>> WebSocket create error:", err))
    };  

  };

  //--

  if (req.body.status == 'completed'){

    if ( app.get('call_type_' + uuid) == "not_websocket") {
      app.set('call_type_' + uuid, undefined);
    }
  };

  //--

  res.status(200).send('Ok');

});

//-----------------------------------------

app.get('/ws_answer', (req, res) => {
  

  const nccoResponse = [
    {
      "action": "conversation",
      "name": "conference_" + req.query.original_uuid
    }
  ];

  // console.log('>>> nccoResponse:\n', nccoResponse);

  res.status(200).json(nccoResponse);

});

//-----------------------------------------

app.post('/ws_event', (req, res) => {

  if (req.body.status == "answered") {

    const wsUuid = req.body.uuid;

    // Get Dialogflow to say its welcome greeting right from the start
    // Change the 'text' argument to be consistent with the DF CX agent welcome intent if necessary
    // Change the 'language' argument to be consistent with the selected language locale if necessary
    setTimeout(() => {
      // vonage.calls.talk.start(wsUuid, {text: 'Hello', language: 'en-US', style: 11  , loop: 1}, (err, res) => {
      //   if (err) { console.error('>>> TTS to bot websocket ' + wsUuid + 'error:', err); }
      //   else {console.log ('>>> TTS to bot websocket ' + wsUuid + ' ok!')}
      // });
      vonage.voice.playTTS(wsUuid,  
        {
        text: 'Hello',
        language: 'en-US', 
        style: 11
        })
        .then(res => console.log('>>> TTS to bot websocket ' + wsUuid + ' ok!'))
        .catch(err => console.error('>>> TTS to bot websocket ' + wsUuid + 'error:', err));
    }, 1000);  
  
  }    

  res.status(200).send('Ok');

});

//-----------------------------------------

app.post('/analytics', (req, res) => {

  console.log(">>> Request and agent reply:", req.body);
 
  res.status(200).send('Ok');

});

//--- If this application is hosted on VCR (Vonage Cloud Runtime) serverless infrastructure --------

app.get('/_/health', async(req, res) => {

  res.status(200).send('Ok');

});


//-----------------------------------------

const port = process.env.NERU_APP_PORT || process.env.PORT || 8000;

app.listen(port, () => console.log(`Server application listening on port ${port}!`));

//------------
