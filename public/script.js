// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const nuevaTareaInput = document.getElementById('nueva-tarea-input');
    const agregarTareaBtn = document.getElementById('agregar-tarea-btn');
    const listaTareasUl = document.getElementById('lista-tareas');

    // CAMBIO IMPORTANTE AQUÍ: Usa una ruta relativa
    const API_BASE_PATH = '/api/tareas'; // Solo la ruta base sin host ni puerto

    // --- Funciones para interactuar con la API ---

    async function obtenerTareas() {
        try {
            // Usa la ruta relativa directamente
            const response = await fetch(API_BASE_PATH);
            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }
            const tareas = await response.json();
            renderizarTareas(tareas);
        } catch (error) {
            console.error('Error al obtener tareas:', error);
            alert('No se pudieron cargar las tareas. Revisa la consola para más detalles.');
        _
        }
    }

    async function agregarTarea() {
        const descripcion = nuevaTareaInput.value.trim();
        if (!descripcion) {
            alert('Por favor, ingresa una descripción para la tarea.');
            return;
        }

        try {
            // Usa la ruta relativa directamente
            const response = await fetch(API_BASE_PATH, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ descripcion }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error HTTP: ${response.status}`);
            }
            nuevaTareaInput.value = ''; // Limpiar input
            obtenerTareas(); // Volver a cargar todas las tareas
        } catch (error) {
            console.error('Error al agregar tarea:', error);
            alert(`No se pudo agregar la tarea: ${error.message}`);
        }
    }

    async function actualizarEstadoTarea(id, completada) {
        try {
            // Usa la ruta relativa para el ID
            const response = await fetch(`${API_BASE_PATH}/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ completada }),
            });

            if (!response.ok) {
                const responseText = await response.text();
                console.error('Error del servidor (no OK) al actualizar:', response.status, response.statusText, responseText);
                let errorMessage = `Error HTTP: ${response.status} ${response.statusText}`;
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.error || errorData.message || responseText;
                } catch (e) {
                    errorMessage = `Server responded with non-JSON: ${responseText.substring(0, 100)}...`;
                }
                throw new Error(errorMessage);
            }

            obtenerTareas(); // Volver a cargar para reflejar el cambio
        } catch (error) {
            console.error('Error al actualizar tarea:', error);
            alert(`No se pudo actualizar la tarea: ${error.message}`);
        }
    }

    async function eliminarTarea(id) {
        console.log(`[FRONTEND] Intentando eliminar tarea con ID: ${id}`);

        if (!id) {
            alert('Error: El ID de la tarea es inválido.');
            return;
        }

        if (!confirm('¿Estás seguro de que deseas eliminar esta tarea?')) {
            return;
        }
        try {
            // Usa la ruta relativa para el ID
            const response = await fetch(`${API_BASE_PATH}/${id}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const responseText = await response.text();
                console.error('Error del servidor (no OK):', response.status, response.statusText, responseText);
                let errorMessage = `Error HTTP: ${response.status} ${response.statusText}`;
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.error || errorData.message || responseText;
                } catch (e) {
                    errorMessage = responseText.substring(0, 100) + "...";
                }
                throw new Error(errorMessage);
            }

            if (response.status === 204) {
                console.log('[FRONTEND] Tarea eliminada (204 No Content)');
            } else {
                const data = await response.json();
                console.log('[FRONTEND] Respuesta de eliminación:', data);
            }

            obtenerTareas(); // Volver a cargar
        } catch (error) {
            console.error('[FRONTEND] Error al eliminar tarea:', error);
            alert(`No se pudo eliminar la tarea. Detalle: ${error.message}`);
        }
    }

    // --- Funciones del DOM ---

    function renderizarTareas(tareas) {
        listaTareasUl.innerHTML = ''; // Limpiar lista actual
        if (tareas.length === 0) {
            listaTareasUl.innerHTML = '<li>No hay tareas pendientes. ¡Añade alguna!</li>';
            return;
        }

        tareas.forEach(tarea => {
            const li = document.createElement('li');
            li.dataset.id = tarea.id;
            if (tarea.completada) {
                li.classList.add('completada');
            }

            const spanDescripcion = document.createElement('span');
            spanDescripcion.textContent = tarea.descripcion;
            spanDescripcion.addEventListener('click', () => { // Permitir marcar/desmarcar al hacer clic en el texto
                actualizarEstadoTarea(tarea.id, !tarea.completada);
            });

            const divAcciones = document.createElement('div');
            divAcciones.classList.add('acciones-tarea');

            const botonCompletar = document.createElement('button');
            botonCompletar.classList.add('btn-completar');
            // Los iconos se eligen según el estado actual de la tarea
            botonCompletar.innerHTML = tarea.completada ? '↩️' : '✔️'; // Deshacer : Completar
            // >>>>>>>>>> CORRECCIÓN AQUÍ <<<<<<<<<<
            botonCompletar.title = tarea.completada ? 'Marcar como pendiente' : 'Marcar como completada';
            // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
            botonCompletar.addEventListener('click', () => {
                actualizarEstadoTarea(tarea.id, !tarea.completada);
            });

            const botonEliminar = document.createElement('button');
            botonEliminar.classList.add('btn-eliminar');
            botonEliminar.innerHTML = '🗑️';
            botonEliminar.title = 'Eliminar tarea';
            botonEliminar.addEventListener('click', () => {
                eliminarTarea(tarea.id);
            });

            divAcciones.appendChild(botonCompletar);
            divAcciones.appendChild(botonEliminar);

            li.appendChild(spanDescripcion);
            li.appendChild(divAcciones);
            listaTareasUl.appendChild(li);
        });
    }

    // --- Event Listeners ---
    agregarTareaBtn.addEventListener('click', agregarTarea);
    nuevaTareaInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            agregarTarea();
        }
    });

    // Carga inicial de tareas
    obtenerTareas();
});