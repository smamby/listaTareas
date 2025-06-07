// __tests__/integration/tareas.integration.test.js
const request = require('supertest');
// Importa las funciones de DB directamente, NO desde app.js
const { initializeDbPool, closeDbPool, executeQuery } = require('../../db'); 
const app = require('../../app'); // La aplicación Express

let server; // Para la instancia del servidor HTTP que Jest controlará
let dbPoolInstance; // Para la instancia del pool de la DB real

beforeAll(async () => {
    // Inicializa la conexión a la DB real
    try {
        dbPoolInstance = await initializeDbPool(); // Usar initializeDbPool
        console.log('[INTEGRATION TESTS] Real DB connection successful.');

        // Inicia el servidor Express en un puerto disponible (puerto 0)
        // supertest se conectará a esta instancia
        server = await new Promise(resolve => {
            const runningServer = app.listen(0, () => {
                const port = runningServer.address().port;
                console.log(`[INTEGRATION TESTS] Servidor de Express iniciado en puerto ${port} para tests.`);
                resolve(runningServer);
            });
        });
    } catch (error) {
        console.error('[INTEGRATION TESTS] Error FATAL al iniciar DB o servidor:', error.message);
        process.exit(1); // Salir si no se puede conectar a la DB real o iniciar el servidor
    }
}, 30000); // Aumenta el timeout para beforeAll

afterAll(async () => {
    // Cierra el servidor Express
    if (server) {
        await new Promise(resolve => server.close(() => {
            console.log('[INTEGRATION TESTS] Servidor Express cerrado.');
            resolve();
        }));
    }
    // Cierra el pool de conexiones de la DB real
    if (dbPoolInstance) {
        await closeDbPool();
        console.log('[INTEGRATION TESTS] DB Pool cerrado.');
    }
}, 10000); 

describe('API de Tareas (Integración con DB Real)', () => {
    // Limpiar la base de datos antes de cada test para asegurar un estado limpio
    beforeEach(async () => {
        try {
            await executeQuery('DELETE FROM tareas'); // Limpia todas las tareas
            // console.log('[INTEGRATION TESTS] Database cleaned for new test.');
        } catch (error) {
            console.error('[INTEGRATION TESTS] Error cleaning database before test:', error.message);
            // Si la tabla no existe aún, podría dar un error, lo cual es normal la primera vez.
        }
    });

    it('POST /api/tareas - debería crear una nueva tarea en la DB real', async () => {
        const nuevaTarea = { descripcion: 'Comprar pan', completada: false };
        const response = await request(server) 
            .post('/api/tareas')
            .send(nuevaTarea);

        expect(response.statusCode).toBe(201);
        expect(response.body.descripcion).toBe(nuevaTarea.descripcion);
        expect(response.body).toHaveProperty('id');
        expect(response.body.completada).toBe(0); // Expect 0, not false, from DB

        // Verificar directamente en la DB usando executeQuery
        const results = await executeQuery('SELECT * FROM tareas WHERE id = ?', [response.body.id]);
        expect(results.length).toBe(1);
        expect(results[0].descripcion).toBe(nuevaTarea.descripcion);
        expect(results[0].completada).toBe(0);
    });

    it('GET /api/tareas - debería obtener tareas de la DB real', async () => {
        await executeQuery('INSERT INTO tareas (descripcion, completada) VALUES (?, ?)', ['Tarea para GET', 0]);
        const response = await request(server).get('/api/tareas');

        expect(response.statusCode).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);

        expect(response.body).toContainEqual(
            expect.objectContaining({ descripcion: 'Tarea para GET' })
        );
    });

    it('PUT /api/tareas/:id - debería actualizar una tarea en la DB real', async () => {
        const insertResult = await executeQuery('INSERT INTO tareas (descripcion) VALUES (?)', ['Tarea para actualizar']);
        const taskId = insertResult.insertId;

        const datosActualizacion = { completada: true };
        const response = await request(server)
            .put(`/api/tareas/${taskId}`)
            .send(datosActualizacion);

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Tarea actualizada correctamente');

        const [result] = await executeQuery('SELECT completada FROM tareas WHERE id = ?', [taskId]);
        expect(result.completada).toBe(1); 
    });

    it('DELETE /api/tareas/:id - debería eliminar una tarea de la DB real', async () => {
        const insertResult = await executeQuery('INSERT INTO tareas (descripcion) VALUES (?)', ['Tarea para eliminar']);
        const taskId = insertResult.insertId;

        const response = await request(server).delete(`/api/tareas/${taskId}`);
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Tarea eliminada correctamente');

        const results = await executeQuery('SELECT * FROM tareas WHERE id = ?', [taskId]);
        expect(results.length).toBe(0); 
    });

    it('POST /api/tareas - debería devolver 400 si falta la descripción', async () => {
        const response = await request(server)
            .post('/api/tareas')
            .send({}); 

        expect(response.statusCode).toBe(400);
        expect(response.body.error).toBe('La descripción es requerida');
    });
});