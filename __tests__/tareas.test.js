// __tests__/tareas.test.js
const request = require('supertest');

// Mocks
let mockTasks = [ // Usa `let` para poder reasignarlo si lo modificas en los tests
    { id: 1, descripcion: 'Tarea 1', completada: 0, fecha_creacion: new Date('2025-06-07T01:48:38.289Z') },
    { id: 2, descripcion: 'Tarea 2', completada: 1, fecha_creacion: new Date('2025-06-07T01:48:38.289Z') },
];

// Mockear el módulo de la base de datos ANTES de importar la aplicación
jest.mock('../db', () => ({
    initializeDbPool: jest.fn().mockResolvedValue(true), // Mockear la inicialización
    getDbPool: jest.fn(() => ({ // Mockear getDbPool para devolver un objeto pool mockeado
        query: jest.fn((sql, values) => {
            console.log(`[TESTS MOCK DB] Ejecutando query: ${sql}, valores: ${JSON.stringify(values)}`);
            if (sql.includes('SELECT')) {
                // Devolver una copia profunda para evitar que los tests muten el mock original
                return [JSON.parse(JSON.stringify(mockTasks))];
            }
            if (sql.includes('INSERT')) {
                // Simular una inserción, devolver un resultado de inserción mockeado
                const newId = Math.max(...mockTasks.map(t => t.id)) + 1; // Asignar un nuevo ID incremental
                const newTask = {
                    id: newId,
                    descripcion: values[0],
                    completada: 0, // Por defecto no completada
                    fecha_creacion: new Date()
                };
                mockTasks.push(newTask);
                return [{ insertId: newId }];
            }
            if (sql.includes('UPDATE')) {
                // Simular actualización, devolver affectedRows mockeado
                const idToUpdate = values[1]; // El ID suele ser el segundo elemento en `values` para UPDATE
                const updatedFields = values[0]; // Los campos a actualizar suelen ser el primer elemento
                let affectedRows = 0;
                mockTasks = mockTasks.map(task => {
                    if (task.id === idToUpdate) {
                        affectedRows = 1;
                        return { ...task, ...updatedFields };
                    }
                    return task;
                });
                return [{ affectedRows: affectedRows }];
            }
            if (sql.includes('DELETE')) {
                // Simular eliminación
                const idToDelete = values[0];
                const initialLength = mockTasks.length;
                mockTasks = mockTasks.filter(t => t.id !== idToDelete);
                return [{ affectedRows: initialLength - mockTasks.length }];
            }
            return [[]]; // Array vacío por defecto para otras consultas
        }),
        getConnection: jest.fn(() => ({ // Mockear getConnection si es necesario (no siempre para simple pool.query)
            release: jest.fn(),
        })),
    })),
    closeDbPool: jest.fn().mockResolvedValue(true), // Mockear el cierre
}));

// Ahora importa la aplicación, DESPUÉS de que el módulo de la base de datos ha sido mockeado
const app = require('../app');
const { initializeDbPool, closeDbPool, getDbPool } = require('../db'); // Re-importar las funciones mockeadas para usarlas en beforeAll/afterAll

describe('API de Tareas', () => {
    // Antes de todos los tests, asegura que el pool de DB mockeado esté inicializado y resetea los mocks
    beforeEach(async () => { // Usar beforeEach para resetear mocks antes de cada test
        // Resetear el estado de los mocks entre tests si los tests modifican `mockTasks`
        mockTasks = [
            { id: 1, descripcion: 'Tarea 1', completada: 0, fecha_creacion: new Date('2025-06-07T01:48:38.289Z') },
            { id: 2, descripcion: 'Tarea 2', completada: 1, fecha_creacion: new Date('2025-06-07T01:48:38.289Z') },
        ];
        jest.clearAllMocks(); // Limpiar llamadas a mocks
        await initializeDbPool(); // Asegura que el initializeDbPool mockeado se "ejecuta"
        // Este console.log puede quedarse o quitarse, es solo para visibilidad
        console.log('[TESTS] Mock DB connection successful for tests.');
    });

    // Limpiar mocks después de todos los tests
    afterAll(async () => {
        await closeDbPool(); // Llamar al closeDbPool mockeado
    });

    // ... (Tus casos de prueba existentes) ...

    it('GET /api/tareas - debe devolver todas las tareas', async () => {
        const response = await request(app).get('/api/tareas');
        expect(response.statusCode).toBe(200);
        // Asegúrate de que las fechas se comparen correctamente o se normalicen
        // Puedes mapear el body para convertir las fechas a objetos Date antes de comparar
        const receivedBody = response.body.map(task => ({
            ...task,
            fecha_creacion: new Date(task.fecha_creacion)
        }));
        expect(receivedBody).toEqual(mockTasks); // Ahora debería funcionar con los datos mockeados
    });

    it('POST /api/tareas - debe crear una nueva tarea', async () => {
        const nuevaTarea = { descripcion: 'Nueva Tarea Test' };
        const response = await request(app)
            .post('/api/tareas')
            .send(nuevaTarea);
        expect(response.statusCode).toBe(201);
        expect(response.body).toHaveProperty('id');
        expect(response.body.descripcion).toBe(nuevaTarea.descripcion);
        expect(response.body.completada).toBe(0); // Asumiendo 0 para falso
        // Opcional: Verifica si la llamada al mock fue correcta
        const dbMock = getDbPool();
        expect(dbMock.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO tareas (descripcion, completada, fecha_creacion) VALUES (?, ?, NOW())'),
            [nuevaTarea.descripcion, 0]
        );
    });

    it('PUT /api/tareas/:id - debe actualizar una tarea existente', async () => {
        const tareaIdActualizar = 1; // Asumiendo que ID 1 existe en tu mockTasks
        const datosActualizacion = { completada: true };
        const response = await request(app)
            .put(`/api/tareas/${tareaIdActualizar}`)
            .send(datosActualizacion);
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Tarea actualizada correctamente');
        // Opcional: Verifica si la llamada al mock fue correcta
        const dbMock = getDbPool();
        expect(dbMock.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE tareas SET completada = ? WHERE id = ?'),
            [1, tareaIdActualizar] // `true` se convierte a `1` en MySQL
        );
    });

    it('DELETE /api/tareas/:id - debe eliminar una tarea existente', async () => {
        const tareaIdEliminar = 1; // Asumiendo que ID 1 existe en tu mockTasks
        const response = await request(app).delete(`/api/tareas/${tareaIdEliminar}`);
        expect(response.statusCode).toBe(200);
        expect(response.body.message).toBe('Tarea eliminada correctamente');
        // Opcional: Verifica si la llamada al mock fue correcta
        const dbMock = getDbPool();
        expect(dbMock.query).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM tareas WHERE id = ?'),
            [tareaIdEliminar]
        );
    });

    it('PUT /api/tareas/:id - debe devolver 404 si la tarea no existe', async () => {
        const tareaIdNoExistente = 999;
        const datosActualizacion = { completada: true };
        const response = await request(app)
            .put(`/api/tareas/${tareaIdNoExistente}`)
            .send(datosActualizacion);
        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe('Tarea no encontrada');
    });

    it('DELETE /api/tareas/:id - debe devolver 404 si la tarea no existe', async () => {
        const tareaIdNoExistente = 999;
        const response = await request(app).delete(`/api/tareas/${tareaIdNoExistente}`);
        expect(response.statusCode).toBe(404);
        expect(response.body.error).toBe('Tarea no encontrada');
    });
});