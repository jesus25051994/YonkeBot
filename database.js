// Importa el conector de PostgreSQL
const { Pool } = require('pg');

// Configuración de la conexión a la base de datos
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});

/**
 * Busca o crea un usuario basado en su número de teléfono.
 */
const findOrCreateUser = async (phoneNumber) => {
    let userResult = await pool.query('SELECT id, name FROM users WHERE phone_number = $1', [phoneNumber]);
    if (userResult.rows.length > 0) {
        return userResult.rows[0]; // Devuelve el usuario existente
    } else {
        userResult = await pool.query('INSERT INTO users (phone_number) VALUES ($1) RETURNING id, name', [phoneNumber]);
        return userResult.rows[0]; // Devuelve el nuevo usuario (sin nombre)
    }
};

/**
 * Guarda un nuevo anuncio en la base de datos.
 */
const crearAnuncio = async (ventaData) => {
    const { seller_id, seller_name, title, description, price, attributes } = ventaData;
    const query = `
        INSERT INTO listings (seller_id, seller_name, listing_type, title, description, price, attributes)
        VALUES ($1, $2, 'auto_part', $3, $4, $5, $6)
        RETURNING *;
    `;
    const values = [seller_id, seller_name, title, description, price, attributes];
    const result = await pool.query(query, values);
	console.log('Anuncio guardado en la base de datos:', result.rows[0]);
    return result.rows[0];
};

const checkBusinessNameExists = async (name, city, municipality, neighborhood) => {
    const query = `
        SELECT id FROM users 
        WHERE LOWER(name) = LOWER($1) 
          AND LOWER(location_city) = LOWER($2) 
          AND LOWER(location_municipality) = LOWER($3)
          AND LOWER(location_neighborhood) = LOWER($4);
    `;
    const result = await pool.query(query, [name, city, municipality, neighborhood]);
    return result.rows.length > 0;
};

const updateUserBusinessData = async (userId, name, city, neighborhood, municipality) => {
    const query = `
        UPDATE users 
        SET name = $1, location_city = $2, location_neighborhood = $3, location_municipality = $4
        WHERE id = $5
        RETURNING *;
    `;
    const result = await pool.query(query, [name, city, neighborhood, municipality, userId]);
    return result.rows[0];
};

/**
 * --- FUNCIÓN MODIFICADA ---
 * Busca anuncios usando ILIKE para cada palabra en la descripción.
 */
const buscarAnuncio = async (terminos) => {
    // 1. Divide los términos de búsqueda en un arreglo de palabras
    const palabras = terminos.trim().split(/\s+/);

    // 2. Crea una condición WHERE para cada palabra, buscando en la descripción
    const condiciones = palabras.map((_, index) => {
        // Usamos ILIKE para que no importe si es mayúscula o minúscula
        // Usamos $1, $2, etc., para pasar los parámetros de forma segura
        return `l.description ILIKE $${index + 1}`;
    });

    // 3. Une todas las condiciones con 'AND' para que deba contener todas las palabras
    const whereClause = condiciones.join(' AND ');

    // 4. Prepara los valores para la consulta, añadiendo los wildcards '%'
    const values = palabras.map(palabra => `%${palabra}%`);

    // 5. Construye la consulta final
    const query = `
        SELECT l.description, l.price, l.attributes, u.name as vendedor_nombre, u.phone_number as contacto
        FROM listings l
        JOIN users u ON l.seller_id = u.id
        WHERE ${whereClause}
        AND l.status = 'active';
    `;
    
    console.log('Ejecutando Query con ILIKE:', query);
    console.log('Valores:', values);

    const result = await pool.query(query, values);
    return result.rows;
};


module.exports = {
    findOrCreateUser,
    checkBusinessNameExists,
    updateUserBusinessData,
    crearAnuncio,
    buscarAnuncio
};
