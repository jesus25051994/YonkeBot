// Importa el conector de PostgreSQL
const { Pool } = require('pg');

// Crea un "pool" de conexiones. Node.js reutilizará conexiones para ser más eficiente.
// El pool leerá automáticamente las variables de entorno (DB_HOST, DB_USER, etc.)
const pool = new Pool();

/**
 * Busca o crea un usuario basado en su número de teléfono.
 * @param {string} phoneNumber - El número de teléfono con el prefijo de whatsapp.
 * @returns {Promise<object>} El ID del usuario.
 */
const findOrCreateUser = async (phoneNumber) => {
    // Primero, intenta encontrar al usuario
    let userResult = await pool.query('SELECT id FROM users WHERE phone_number = $1', [phoneNumber]);

    if (userResult.rows.length > 0) {
        // Si el usuario existe, devuelve su ID
        return userResult.rows[0];
    } else {
        // Si no existe, créalo
        userResult = await pool.query('INSERT INTO users (phone_number) VALUES ($1) RETURNING id', [phoneNumber]);
        return userResult.rows[0];
    }
};

/**
 * Guarda un nuevo anuncio en la base de datos.
 * @param {object} ventaData - Objeto con los datos de la venta.
 * @returns {Promise<object>} El anuncio guardado.
 */
const crearAnuncio = async (ventaData) => {
    const { seller_id, title, description, price, attributes } = ventaData;
    
    const query = `
        INSERT INTO listings (seller_id, listing_type, title, description, price, attributes)
        VALUES ($1, 'auto_part', $2, $3, $4, $5)
        RETURNING *;
    `;

    // Para el ejemplo, el title será la pieza y la descripción será el vehículo y condición
    const values = [seller_id, title, description, price, attributes];
    
    const result = await pool.query(query, values);
    console.log('Anuncio guardado en la base de datos:', result.rows[0]);
    return result.rows[0];
};

/**
 * Busca anuncios usando el índice de texto completo.
 * @param {string} terminos - Palabras clave para la búsqueda.
 * @returns {Promise<Array<object>>} Un arreglo de anuncios que coinciden.
 */
const buscarAnuncio = async (terminos) => {
    const query = `
        SELECT l.id, l.title, l.description, l.price, l.attributes, u.phone_number as contacto
        FROM listings l
        JOIN users u ON l.seller_id = u.id
        WHERE l.search_vector @@ to_tsquery('spanish', $1)
        AND l.status = 'active';
    `;
    
    // Formatea los términos para la búsqueda: 'palabra1 & palabra2'
    const formattedTerms = terminos.trim().split(/\s+/).join(' & ');
    
    const result = await pool.query(query, [formattedTerms]);
    return result.rows;
};


module.exports = {
    findOrCreateUser,
    crearAnuncio,
    buscarAnuncio
};
