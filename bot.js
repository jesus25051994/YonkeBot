// Carga las variables de entorno desde el archivo .env
require('dotenv').config();

// Importa las librerías necesarias
const express = require('express');
const twilio = require('twilio');
const { findOrCreateUser, crearAnuncio, buscarAnuncio, updateUserBusinessData } = require('./database.js');

// --- CONFIGURACIÓN ---
const app = express();
app.use(express.urlencoded({ extended: false }));

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;
const PORT = process.env.PORT || 3000;

// --- Expresiones Regulares ---
const regexBuscar = /\b(buscar|busco|vusco|vuzco|buzco|vuzcar)\b/i; // <-- EXPRESIÓN CLAVE
const regexVender = /\b(ando|bedo|vender|nesecito|nesesito|nececito|urge|vendiendolo|quiero\s+vender|necesito\s+vender|deseo\s+vender|me\s+gustar[ií]a\s+vender)\b/i;
const regexVehiculo = /\b((?:[a-zA-Z0-9\s]+)\s+\d{4})\b/i; // Se añadió soporte para números en el modelo del vehículo
const regexCondicion = /(?:condici[oó]n|condision|estado)\s*(\d+)(?:\s*(?:\/|de)\s*10)?/i;
const regexSplitter = /\s+y\s+tambi[eé]n\s+|\s+tambi[eé]n\s*,\s*|\s*,\s*y\s+|\s+y\s+/i;
const regexPrecio = /\b(?:(?:(pres|prec)io\s*(?:es\s+de)?\s*:?\s*)|(?:\$\s*))(\d+(?:[.,]\d+)?)\b/i;


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
         } else if (regexVender.test(mensajeRecibido.toLowerCase())) {
				
            // Lógica para iniciar el registro de un vendedor o una venta
            const user = await findOrCreateUser(numeroUsuario);
            if (user.name) {
				//---------------INICIO----------
				const productos = mensajeRecibido.split(regexSplitter);
				let datosParciales = [];
				
				for (const productoTexto of productos) {
					const datosProducto = {};
					const matchVehiculo = productoTexto.match(regexVehiculo);
					const matchCondicion = productoTexto.match(regexCondicion);
					const matchPrecio = productoTexto.match(regexPrecio);
					datosProducto.vehicle = matchVehiculo ? matchVehiculo[1].trim() : null;
					datosProducto.condition = matchCondicion ? `${matchCondicion[1]}/10` : null;
					datosProducto.price = matchPrecio ? parseInt(matchPrecio[2]) : null;
					let pieza = productoTexto.replace(regexVehiculo, '').replace(regexCondicion, '').replace(regexPrecio, '').replace(regexVender, '').replace(/\bde\b/gi, '').replace(/,/g, '').replace(/pesos/gi, '').replace(/\s+/g, ' ').trim();
					datosProducto.title = pieza;
					datosParciales.push(datosProducto);
				}
				
				const faltaAlgunDato = datosParciales.some(p => !p.price || !p.vehicle || !p.condition);
				if (!faltaAlgunDato) {
					const user = await findOrCreateUser(numeroUsuario);
					for(const prod of datosParciales) {
						prod.seller_id = user.id;
						prod.description = `${prod.title} para ${prod.vehicle}, Condición: ${prod.condition}`;
						prod.attributes = { vehicle: prod.vehicle, condition: prod.condition };
						await crearAnuncio(prod);
					}
					respuesta = `✅ ¡Perfecto! He registrado ${datosParciales.length} producto(s) con éxito.`;
				} else {
					respuesta = await iniciarVenta(numeroUsuario);
				}
				//---------------FIN------
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
	
	//Vamos a comentar el envío de mensajes de watsapp porque superamos el limite, vamos a pintarlo en consola.
    console.log(respuesta);
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
    const estadoProceso = conversaciones[numero];
    let respuesta;

    switch (estadoProceso.paso) {
        // --- Flujo de Registro de Negocio ---
        case 'esperando_nombre_negocio':
            const nombreNegocio = mensaje.trim();
            // Aquí podrías añadir la validación de nombre duplicado si la necesitas
            // const yaExiste = await checkBusinessNameExists(nombreNegocio);
            // if (yaExiste) {
            //     return 'Lo siento, ese nombre de negocio ya está registrado. Por favor, intenta con otro nombre.';
            // }
            estadoProceso.datos.name = nombreNegocio;
            estadoProceso.paso = 'esperando_ubicacion';
            respuesta = `✅ Nombre registrado: *${nombreNegocio}*.\n\nAhora, por favor, dime tu ubicación en este formato: **Estado, Municipio, Colonia**`;
            break;

        case 'esperando_ubicacion':
            const ubicacionArray = mensaje.split(',').map(item => item.trim());
            const [estado, municipio, colonia] = ubicacionArray;

            if (!estado || !municipio || !colonia) {
                respuesta = 'Formato incorrecto. Por favor, asegúrate de enviar la ubicación así: **Estado, Municipio, Colonia**';
                break;
            }
            
            await updateUserBusinessData(estadoProceso.datos.user_id, estadoProceso.datos.name, estado, colonia, municipio);
            
            delete conversaciones[numero];
            respuesta = `¡Excelente! Tu negocio *${estadoProceso.datos.name}* ha sido registrado con éxito.\n\nAhora ya puedes empezar a vender. Intenta de nuevo escribiendo: **vender [tu pieza]**`;
            break;

        // --- Flujo de Venta de Pieza (Paso a Paso) ---
        case 'esperando_pieza':
            estadoProceso.datos.title = mensaje;
            estadoProceso.paso = 'esperando_vehiculo';
            respuesta = `✅ Pieza: ${mensaje}.\nAhora dime el vehículo (marca, modelo y año).`;
            break;
        
        case 'esperando_vehiculo':
            estadoProceso.datos.vehicle = mensaje;
            estadoProceso.paso = 'esperando_condicion';
            respuesta = `✅ Vehículo: ${mensaje}.\nAhora, la condición (del 1 al 10).`;
            break;

        case 'esperando_condicion':
            estadoProceso.datos.condition = `${mensaje}/10`;
            estadoProceso.paso = 'esperando_precio';
            respuesta = `✅ Condición: ${mensaje}/10.\nFinalmente, dime el precio (solo el número).`;
            break;
        
        case 'esperando_precio':
            estadoProceso.datos.price = parseInt(mensaje);
            estadoProceso.datos.description = `${estadoProceso.datos.title} para ${estadoProceso.datos.vehicle}, Condición: ${estadoProceso.datos.condition}`;
            estadoProceso.datos.attributes = { vehicle: estadoProceso.datos.vehicle, condition: estadoProceso.datos.condition };
            
            await crearAnuncio(estadoProceso.datos);
            delete conversaciones[numero];
            respuesta = '🎉 ¡Tu pieza ha sido registrada con éxito!';
            break;

        default:
            respuesta = 'Lo siento, no entendí esa parte. ¿Podrías repetirla?';
            break;
    }
    return respuesta;
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
