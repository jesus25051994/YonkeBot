// --- SIMULACIÓN DE BASE DE DATOS ---
// En un proyecto real, esto se conectaría a tu base de datos RDS.
const inventario = [
    { id: 1, vendedor: 'Yonke El Güero', pieza: 'alternador', vehiculo: 'Tsuru 2010', condicion: '9/10', precio: 800, contacto: '6671234567' },
    { id: 2, vendedor: 'Yonke Culiacán', pieza: 'defensa delantera', vehiculo: 'Ford Ranger 2015', condicion: '8/10', precio: 1500, contacto: '6677654321' }
];

/**
 * Guarda una nueva pieza en el inventario.
 * En el futuro, esta función ejecutará un INSERT en tu tabla de SQL.
 * @param {object} pieza - El objeto de la pieza a guardar.
 * @returns {Promise<object>} La pieza guardada.
 */
const guardarPieza = async (pieza) => {
    console.log('Guardando pieza en la base de datos (simulado):', pieza);
    pieza.id = inventario.length + 1; // Simula un ID autoincremental
    inventario.push(pieza);
    return pieza;
};

/**
 * Busca piezas en el inventario que coincidan con las palabras clave.
 * En el futuro, esta función ejecutará un SELECT ... WHERE ... LIKE en tu tabla.
 * @param {string} terminosDeBusqueda - Lo que el usuario escribió para buscar.
 * @returns {Promise<Array<object>>} Un arreglo de piezas que coinciden.
 */
const buscarPieza = async (terminosDeBusqueda) => {
    console.log(`Buscando "${terminosDeBusqueda}" en la base de datos (simulado)`);
    const terminos = terminosDeBusqueda.toLowerCase().split(' ');
    
    const resultados = inventario.filter(item => {
        const textoItem = `${item.pieza} ${item.vehiculo}`.toLowerCase();
        // Comprueba si todos los términos de búsqueda están en el texto del item
        return terminos.every(termino => textoItem.includes(termino));
    });

    return resultados;
};

module.exports = {
    guardarPieza,
    buscarPieza
};