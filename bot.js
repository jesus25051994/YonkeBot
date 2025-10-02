// Carga las variables de entorno desde el archivo .env
require('dotenv').config();

// Importa las librerías necesarias
const express = require('express');
const twilio = require('twilio');
const { findOrCreateUser, crearAnuncio, buscarAnuncio } = require('./database.js');

// --- CONFIGURACIÓN ---
const app = express();
app.use(express.urlencoded({ extended: false }));

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;
const PORT = process.env.PORT || 3000;

// --- Expresiones Regulares ---
const regexVender = /\b(vender|quiero\s+vender|necesito\s+vender)\b/i;
const regexBuscar = /\b(buscar|busco)\b/i; // <-- EXPRESIÓN CLAVE

const conversaciones = {};

// --- WEBHOOK PRINCIPAL ---
app.post('/whatsapp', async (req, res) => {
    const mensajeRecibido = (req.body.Body || '').trim();
    const numeroUsuario = req.body.From;
    console.log(`Mensaje de ${numeroUsuario}: "${mensajeRecibido}"`);
    let respuesta = '';

    try {
        if (conversaciones[numeroUsuario]) {
            // Lógica de conversación (registro, etc.)
            respuesta = await manejarConversacion(numeroUsuario, mensajeRecibido);
        } else if (regexVender.test(mensajeRecibido)) {
            // Lógica para iniciar el registro de un vendedor o una venta
            const user = await findOrCreateUser(numeroUsuario);
            if (user.name) {
                respuesta = await iniciarVenta(numeroUsuario, user);
            } else {
                conversaciones[numeroUsuario] = { paso: 'esperando_nombre_negocio', datos: { user_id: user.id } };
                respuesta = '¡Hola! Para vender, primero necesito registrar tu negocio.\n\nPor favor, dime el **nombre de tu yonke o negocio**.';
            }
        } else if (regexBuscar.test(mensajeRecibido)) { // <-- CONDICIÓN CORREGIDA
            // Extraemos los términos de búsqueda, quitando la palabra "buscar" o "busco"
            const terminos = mensajeRecibido.replace(regexBuscar, '').trim();
            respuesta = terminos ? await ejecutarBusqueda(terminos) : 'Por favor, dime qué pieza estás buscando.';
        } else {
            respuesta = '¡Bienvenido al YonkeBot de Sinaloa! Para buscar, escribe `Busco [pieza]`. Para vender, escribe `Vender`.';
        }
    } catch (error) {
        console.error('Ocurrió un error:', error);
        respuesta = 'Lo siento, ocurrió un error inesperado. Inténtalo de nuevo.';
    }

    await client.messages.create({ body: respuesta, from: twilioNumber, to: numeroUsuario });
    res.status(200).send('<Response/>');
});

// --- OTRAS FUNCIONES ---
// (Aquí van tus funciones `iniciarVenta`, `manejarConversacion`, `ejecutarBusqueda`, etc., sin cambios)
// ... (pega aquí el resto de tus funciones como estaban)
const iniciarVenta = async (numero, user) => {
    conversaciones[numero] = {
        paso: 'esperando_pieza',
        datos: { seller_id: user.id, seller_name: user.name }
    };
    return '¡Perfecto! Vamos a registrar tu pieza. Por favor, dime el nombre de la pieza, vehículo, año, condición y precio.';
};

const manejarConversacion = async (numero, mensaje) => {
    const estado = conversaciones[numero];
    // ... (El resto del switch case para manejar el registro y la venta paso a paso)
    return "Lógica de conversación pendiente...";
};

const ejecutarBusqueda = async (terminos) => {
    const resultados = await buscarAnuncio(terminos);
    if (resultados.length === 0) {
        return `Lo siento, no encontré nada para "${terminos}". 😔`;
    }
    let respuesta = `¡Encontré ${resultados.length} resultado(s)! 👇\n\n`;
	
	
    resultados.forEach(item => {
		if(item.vendedor_nombre == null)
		{
			item.vendedor_nombre = `Local sin Nombre`
		}
        respuesta += `---
*Vendido por:* **${item.vendedor_nombre}**
*Descripción:* ${item.description}
*Precio:* $${item.price || 'Contactar'}
*Contacto:* \`wa.me/${item.contacto.replace('whatsapp:+', '')}\`\n\n`;
    });
    return respuesta;
};

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}.`);
});
