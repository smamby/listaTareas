// __tests__/integration/tareas.integration.test.js
const request = require('supertest');
// NO MOCKEES 'mysql2' aquí. Queremos la base de datos real.

// Importa tu aplicación Express
// Es crucial que tu app.js o server.js exporte la instancia de Express 'app'
// y no inicie el servidor HTTP directamente en el archivo importado.
// server.js debería contener app.listen y app.js debería exportar 'app'.
const { app, initiateDbConnection } = require('../../app');

// Mantenemos una referencia al servidor HTTP
let server;
// Mantenemos una referencia al pool de la base de datos real
let dbPool;

// --- Configuración antes de TODOS los tests de integración ---
beforeAll(async () => {
    // Inicializa la conexión a la DB real (no simulada)
    // La initiateDbConnection debe ser asíncrona o usar promesas/callbacks.
    // Asegúrate de que DB_HOST apunte al servicio 'mysql_db' (definido en docker-compose.yml)
    // y que las otras variables de entorno (DB_USER, DB_PASSWORD, DB_NAME) estén disponibles.
    await new Promise((resolve, reject) => {
        initiateDbConnection(
            (pool) => {
                console.log('[INTEGRATION TESTS] Real DB connection successful.');
                dbPool = pool;
                // Inicia el servidor Express en un puerto diferente para los tests
                // Esto es importante para no chocar con el puerto 8000 si tu app ya está corriendo
                // Si tu app ya está corriendo en Docker, puedes hacer peticiones a http://app:8000
                // pero para pruebas locales directas, es mejor iniciarla aquí.
                // Opcional: si la app ya corre en Docker, puedes omitir 'server = app.listen()'
                // y hacer las peticiones a http://localhost:8000 o http://app:8000
                server = app.listen(8001, () => {
                    console.log('[INTEGRATION TESTS] Express app started on port 8001 for tests.');
                    resolve();
                });
            },
            (err) => {
                console.error('[INTEGRATION TESTS] Real DB connection failed:', err);
                reject(err);
            }
        );
    });

    // Opcional: Limpiar la base de datos antes de las pruebas de integración
    // Esto asegura que cada corrida de tests empiece con un estado limpio.
    try {
        await dbPool.query('DELETE FROM tareas'); // Limpia la tabla
        console.log('[INTEGRATION TESTS] Cleared "tareas" table.');
    } catch (error) {
        console.error('[INTEGRATION TESTS] Error clearing "tareas" table:', error);
        // Si la tabla no existe aún, podría dar un error, lo cual es normal la primera vez.
    }
}, 30000); // Aumenta el timeout si la DB tarda en arrancar (30 segundos)

// --- Configuración después de TODOS los tests de integración ---
afterAll(async () => {
    if (server) {
        await new Promise(resolve => server.close(resolve));
        console.log('[INTEGRATION TESTS] Express app closed.');
    }
    if (dbPool) {
        await dbPool.end(); // Cierra el pool de conexiones a la DB
        console.log('[INTEGRATION TESTS] DB pool closed.');
    }
});

// --- Pruebas de Integración ---
describe('API de Tareas (Integración con DB Real)', () => {

    // Test POST: Crear una nueva tarea
    it('POST /api/tareas - debería crear una nueva tarea en la DB real', async () => {
        const nuevaTarea = { descripcion: 'Comprar pan', completada: false };
        const response = await request(server) // Usamos 'server' que iniciamos en beforeAll
            .post('/api/tareas')
            .send(nuevaTarea);

        expect(response.statusCode).toBe(201);
        expect(response.body.descripcion).toBe(nuevaTarea.descripcion);
        expect(response.body).toHaveProperty('id');
        expect(response.body.completada).toBe(false);

        // Opcional: Verificar directamente en la DB
        const [rows] = await dbPool.query('SELECT * FROM tareas WHERE id = ?', [response.body.id]);
        expect(rows.length).toBe(1);
        expect(rows[0].descripcion).toBe(nuevaTarea.descripcion);
    });

    // Test GET: Obtener todas las tareas (después de la creación anterior)
    it('GET /api/tareas - debería obtener tareas de la DB real', async () => {
        const response = await request(server).get('/api/tareas');
        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0); // Debería tener al menos la tarea que creamos

        // Verifica que la tarea creada anteriormente esté presente
        expect(response.body).toContainEqual(
            expect.objectContaining({ descripcion: 'Comprar pan' })
        );
    });

    // Test PUT: Actualizar una tarea
    it('PUT /api/tareas/:id - debería actualizar una tarea en la DB real', async () => {
        // Primero, crea una tarea para asegurar que exista una para actualizar
        const { body: { id: taskId } } = await request(server)
            .post('/api/tareas')
            .send({ descripcion: 'Tarea para actualizar', completada: false });

        const datosActualizacion = { completada: true };
        const response = await request(server)
            .put(`/api/tareas/${taskId}`)
            .send(datosActualizacion);

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Tarea actualizada correctamente');

        // Verifica directamente en la DB
        const [rows] = await dbPool.query('SELECT * FROM tareas WHERE id = ?', [taskId]);
        expect(rows.length).toBe(1);
        expect(rows[0].completada).toBe(1); // MySQL puede devolver 1 para true
    });

    // Test DELETE: Eliminar una tarea
    it('DELETE /api/tareas/:id - debería eliminar una tarea de la DB real', async () => {
        // Primero, crea una tarea para asegurar que exista una para eliminar
        const { body: { id: taskId } } = await request(server)
            .post('/api/tareas')
            .send({ descripcion: 'Tarea para eliminar', completada: false });

        const response = await request(server).delete(`/api/tareas/${taskId}`);
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Tarea eliminada correctamente');

        // Verifica directamente en la DB
        const [rows] = await dbPool.query('SELECT * FROM tareas WHERE id = ?', [taskId]);
        expect(rows.length).toBe(0); // La tarea ya no debería existir
    });

    // Test de validación (ej. POST con datos inválidos)
    it('POST /api/tareas - debería devolver 400 si falta la descripción', async () => {
        const response = await request(server)
            .post('/api/tareas')
            .send({}); // Objeto vacío, falta descripción

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBeDefined(); // O un mensaje de error específico
    });

});