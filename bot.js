// Carga las variables de entorno desde el archivo .env
require('dotenv').config();

// Importa las librerías necesarias
const express = require('express');
const twilio = require('twilio');
//const { guardarPieza, buscarPieza } = require('./database.js');
const { findOrCreateUser, crearAnuncio, buscarAnuncio } = require('./database.js');

// --- CONFIGURACIÓN ---
const app = express();
app.use(express.urlencoded({ extended: false }));

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;
const PORT = process.env.PORT || 3000;

// Objeto para manejar conversaciones de varios pasos (ej. registrar una pieza)
const conversaciones = {};

// --- WEBHOOK PRINCIPAL ---
// Twilio enviará una petición POST a esta ruta cada vez que recibas un mensaje.
app.post('/whatsapp', async (req, res) => {
    const mensajeRecibido = req.body.Body.toLowerCase().trim();
    const numeroUsuario = req.body.From;

    console.log(`Mensaje de ${numeroUsuario}: "${mensajeRecibido}"`);

    // Lógica para determinar qué hacer con el mensaje
    let respuesta = '';

    // Si el usuario está en medio de una conversación, la manejamos primero
    if (conversaciones[numeroUsuario]) {
        respuesta = await manejarConversacion(numeroUsuario, mensajeRecibido);
    } else {
        // Si no, verificamos si es un comando nuevo
        if (mensajeRecibido.startsWith('vender')) {
            respuesta = await iniciarVenta(numeroUsuario);
        } else if (mensajeRecibido.startsWith('buscar')) {
            const terminos = mensajeRecibido.substring('buscar'.length).trim();
            if (terminos) {
                respuesta = await ejecutarBusqueda(terminos);
            } else {
                respuesta = 'Por favor, dime qué pieza estás buscando. Ejemplo: `buscar defensa tsuru`';
            }
        } else {
            respuesta = '¡Bienvenido al YonkeBot de Sinaloa! 🤖\n\nPara encontrar una pieza, escribe: `buscar [pieza] [carro]`\n\nPara anunciar una pieza, escribe: `vender`';
        }
    }

    // Enviamos la respuesta de vuelta al usuario a través de Twilio
    await client.messages.create({
        body: respuesta,
        from: twilioNumber,
        to: numeroUsuario
    });
    
    // Respondemos a Twilio para que sepa que recibimos el mensaje correctamente
    res.status(200).send('<Response/>');
});


// --- LÓGICA DE CONVERSACIONES ---
const iniciarVenta = async (numero) => {
    const user = await findOrCreateUser(numero);

    conversaciones[numero] = {
        paso: 'esperando_pieza',
        datos: { seller_id: user.id } // Guardamos el ID del vendedor
    };
    return '¡Perfecto! Vamos a registrar tu pieza.\n\nPrimero, dime el **nombre de la pieza** (ej. Alternador, Faro izquierdo).';
};

const manejarConversacion = async (numero, mensaje) => {
    const estado = conversaciones[numero];
    
    switch (estado.paso) {
        case 'esperando_pieza':
            estado.datos.pieza = mensaje;
            estado.paso = 'esperando_vehiculo';
            return '✅ Entendido. Ahora dime la **marca, modelo y año del vehículo** (ej. Tsuru 2015).';

        case 'esperando_vehiculo':
            estado.datos.vehiculo = mensaje;
            estado.paso = 'esperando_condicion';
            return '✅ ¡Genial! En una escala del 1 al 10, ¿cuál es la **condición** de la pieza?';

        case 'esperando_condicion':
            const estado = conversaciones[numero];
            estado.datos.title = estado.datos.pieza; // El título será el nombre de la pieza
            estado.datos.description = `${estado.datos.vehiculo}, Condición: ${mensaje}/10`;
        
            // Creamos el objeto de atributos para el campo JSONB
            estado.datos.attributes = {
                vehicle: estado.datos.vehiculo,
                condition: `${mensaje}/10`
            };
        
            // Guardamos el anuncio en la base de datos real
            await crearAnuncio(estado.datos);
        
            delete conversaciones[numero];
        
            return '🎉 ¡Tu pieza ha sido registrada con éxito!';
    }
    return 'Lo siento, no entendí esa parte. ¿Podrías repetirla?';
};

const ejecutarBusqueda = async (terminos) => {
   const resultados = await buscarAnuncio(terminos);

    if (resultados.length === 0) {
        return `Lo siento, no encontré nada para "${terminos}". 😔`;
    }

    let respuesta = `¡Encontré ${resultados.length} resultado(s) para "${terminos}"! 👇\n\n`;

    resultados.forEach(item => {
        respuesta += `---
        *Pieza:* ${item.pieza}
        *Vehículo:* ${item.vehiculo}
        *Condición:* ${item.condicion}
        *Vendido por:* ${item.vendedor}
        *Contacto:* \`wa.me/${item.contacto}\`\n\n`;
    });
    
    return respuesta;
};

// --- INICIAR EL SERVIDOR ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}. ¡Listo para recibir mensajes de WhatsApp!`);
});
