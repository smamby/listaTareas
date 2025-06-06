// __tests__/tareas.test.js
const request = require('supertest');

// Mock de la base de datos para las pruebas
const mockTasks = [
    { id: 1, descripcion: 'Tarea 1', completada: false, fecha_creacion: new Date().toISOString() },
    { id: 2, descripcion: 'Tarea 2', completada: true, fecha_creacion: new Date().toISOString() },
];

// Mock de la conexión para el pool
const mockConnection = {
    query: jest.fn((sql, paramsOrCallback, callback) => {
        const actualCallback = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
        
        if (sql.toUpperCase().startsWith('SELECT * FROM TAREAS')) {
            actualCallback(null, mockTasks);
        } else if (sql.toUpperCase().startsWith('INSERT INTO TAREAS')) {
            const newId = mockTasks.length + 3;
            actualCallback(null, { insertId: newId });
        } else if (sql.toUpperCase().startsWith('UPDATE TAREAS')) {
            actualCallback(null, { affectedRows: 1 });
        } else if (sql.toUpperCase().startsWith('DELETE FROM TAREAS')) {
            actualCallback(null, { affectedRows: 1 });
        } else {
            actualCallback(new Error(`Unhandled SQL query in mock: ${sql}`));
        }
    }),
    release: jest.fn() // Mock del método release para liberar la conexión
};

// Mock del pool de conexiones
const mockPool = {
    getConnection: jest.fn((callback) => {
        // Simular una conexión exitosa
        setTimeout(() => callback(null, mockConnection), 0);
    }),
    on: jest.fn() // Mock para el manejo de eventos del pool
};

// Mock del módulo mysql2 ANTES de importar app.js
jest.mock('mysql2', () => ({
    createPool: jest.fn(() => {
        console.log('[MOCK DB] createPool() called, returning mock pool');
        return mockPool;
    })
}));

// Importar app DESPUÉS de que los mocks estén configurados
const { app, initiateDbConnection } = require('../app');

// Variable para mantener la instancia del pool simulado
let mockDbInstance;

// Antes de todas las pruebas, inicializa la conexión a la DB (simulada)
beforeAll(done => {
    initiateDbConnection(
        (db) => { // onSuccess
            console.log('[TESTS] Mock DB connection successful for tests.');
            mockDbInstance = db;
            done();
        },
        (err) => { // onFailure - no debería ocurrir con el mock
            console.error('[TESTS] Mock DB connection failed for tests. This should not happen with mocks.', err);
            done(err);
        }
    );
}, 10000); // Timeout más alto para el beforeAll

// Limpiar mocks después de cada prueba
afterEach(() => {
    jest.clearAllMocks();
});

describe('API de Tareas', () => {
    it('GET /api/tareas - debe devolver todas las tareas', async () => {
        const response = await request(app).get('/api/tareas');
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(mockTasks);
    });

    it('POST /api/tareas - debe crear una nueva tarea', async () => {
        const nuevaTareaDescripcion = 'Nueva Tarea Test';
        const response = await request(app)
            .post('/api/tareas')
            .send({ descripcion: nuevaTareaDescripcion });

        expect(response.statusCode).toBe(201);
        expect(response.body.descripcion).toBe(nuevaTareaDescripcion);
        expect(response.body).toHaveProperty('id');
    });

    it('PUT /api/tareas/:id - debe actualizar una tarea existente', async () => {
        const tareaIdActualizar = 1;
        const datosActualizacion = { completada: true };
        const response = await request(app)
            .put(`/api/tareas/${tareaIdActualizar}`)
            .send(datosActualizacion);

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Tarea actualizada correctamente');
    });

    it('PUT /api/tareas/:id - debe devolver 404 si la tarea no existe', async () => {
        // Override del mock solo para este test
        mockConnection.query.mockImplementationOnce((sql, params, callback) => {
            if (sql.toUpperCase().startsWith('UPDATE TAREAS')) {
                callback(null, { affectedRows: 0 }); // Simular tarea no encontrada
            } else {
                callback(new Error('SQL no manejado en mockImplementationOnce para PUT 404'));
            }
        });

        const tareaIdInexistente = 999;
        const datosActualizacion = { completada: true };
        const response = await request(app)
            .put(`/api/tareas/${tareaIdInexistente}`)
            .send(datosActualizacion);
        
        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe('Tarea no encontrada');
    });

    it('DELETE /api/tareas/:id - debe eliminar una tarea existente', async () => {
        const tareaIdEliminar = 1;
        const response = await request(app).delete(`/api/tareas/${tareaIdEliminar}`);

        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Tarea eliminada correctamente');
    });

    it('DELETE /api/tareas/:id - debe devolver 404 si la tarea no existe', async () => {
        // Override del mock solo para este test
        mockConnection.query.mockImplementationOnce((sql, params, callback) => {
            if (sql.toUpperCase().startsWith('DELETE FROM TAREAS')) {
                callback(null, { affectedRows: 0 }); // Simular tarea no encontrada
            } else {
                callback(new Error('SQL no manejado en mockImplementationOnce para DELETE 404'));
            }
        });

        const tareaIdInexistente = 999;
        const response = await request(app).delete(`/api/tareas/${tareaIdInexistente}`);
        
        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe('Tarea no encontrada');
    });
});