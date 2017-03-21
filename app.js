/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var express = require('express'); // app server
var bodyParser = require('body-parser'); // parser for post requests
var Conversation = require('watson-developer-cloud/conversation/v1'); // conversation sdk
var DiscoveryV1 = require('watson-developer-cloud/discovery/v1'); // discovery sdk

var app = express();

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// Create the service wrapper
var conversation = new Conversation({
  // If unspecified here, the CONVERSATION_USERNAME and CONVERSATION_PASSWORD env properties will be checked
  // After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES environment property
  // username: '<username>',
  // password: '<password>',
  url: 'https://gateway.watsonplatform.net/conversation/api',
  version_date: '2016-10-21',
  version: 'v1'
});

// Create the service wrapper for Discovery
var discovery = new DiscoveryV1 ({
  // If unspecified here, the DISCOVERY_USERNAME and
  // DISCOVERY_PASSWORD env properties will be checked
  // After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES environment property
  // username: '<username>',
  // password: '<password>',
  version_date: DiscoveryV1.VERSION_DATE_2016_12_15,
  version: 'v1'

});


// Endpoint to be call from the client side
app.post('/api/message', function(req, res) {
  var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' + 'Once a workspace has been defined the intents may be imported from ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    });
  }
  var payload = {
    workspace_id: workspace,
    context: req.body.context || {},
    input: req.body.input || {}
  };

  // Send the input to the conversation service
  conversation.message(payload, function(err, data) {
    if (err) {
      return res.status(err.code || 500).json(err);
    }
    if (data.context.call_discovery) { // Revisamos si debemos invocar Discovery
      console.log("data.context.call_discovery == true");
      delete data.context.call_discovery; // Eliminamos la variable de contexto call_discovery para que las proximas llamadas no siempre invoquen Discovery

      // Invocamos Discovery porque existe la variable call_discovery
      discovery.query({
        environment_id: process.env.ENVIRONMENT_ID, // ID del ambiente de Discovery (variable de ambiente)
        collection_id: process.env.COLLECTION_ID, // ID de la coleccion de documentos (variable de ambiente)
        query: data.input.text, // Le pasamos a Discovery lo que escribió el usuario originalmente
        count: 5 // retornar maximo 5 documentos
      }, function (err, searchResponse) {
        data.output.text = []; // Borramos la respuesta original de Conversation, más adelante en la respuesta colocamos los documentos que retorna la consulta en Discovery

        if (err) { // Si hubo algun error invocando el servicio de discovery le avisamos al usuario
          console.error(err);
          console.log('Discovery error searching for documents: ' + err);
          data.output.text.push("Ocurrió un error inesperado en el servicio de Discovery.<br>Por favor, intenta nuevamente.");
        }
        else { // Si no hubo error, revisamos los resultados que retornó discovery
          var docs = searchResponse.results;

          if (docs.length > 0) { // Si encontró documentos, entonces le retornamos los documentos como respuesta al usuario
            console.log("Se encontraron ", docs.length, " documentos para el query de discovery");
            var responseText = "Excelente pregunta. Encontré algunas ideas para ti:<br>";
            
            for (var i = 0; i < docs.length; i++) { // Le aplicamos estilo a las respuestas
              responseText += "<div class='docContainer'>"+
                "<div title='Ver contenido' class='docBody'>"+
                    "<div class='docBodyTitle'>"+
                      docs[i].extracted_metadata.title +
                    "</div>"+
                    "<div class='docBodySnippet'>"+
                      docs[i].text +
                    "</div>"+
                  "</div>"+
                  "<div class='modal' hidden>"+
                  "<div class='modal-header'>"+
                    "<div class='modal-doc'>"+
                      docs[i].extracted_metadata.title +
                    "</div>"+
                    "<span class='modal-close'>"+
                      "<img src='img/close-button.png' class='close-button'>"+
                    "</span>"+
                  "</div>"+
                  "<div class='bodyText'>"+
                    docs[i].text +
                  "</div>"+
                "</div>"+
              "</div>";
            }
            responseText = responseText.replace(/\n/g, "<br>"); //Reemplazamos los \n con <br> para que las respuestas tengan un formato legible en los navegadores
            
            data.output.text.push(responseText); // Colocamos los documentos como respuesta final al usuario
          }
          else { // Si no encontró ningún documento le avisamos al usuario
            console.log("se encontraron 0 documentos en Discovery.");
            data.output.text.push("Lo siento, no encontré nada para ayudarte con ese problema.");
          }
        }

        return res.json(data); // Le retornamos la respuesta con documentos al usuario
      });
    }
    else { // Si no se debe invocar discovery ni ningún otro servicio, retornamos la respuesta normal de conversation
      return res.json(data);
    }
    
  });
});


module.exports = app;
