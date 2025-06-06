-- Este script se ejecuta cuando el contenedor MySQL se inicia por primera vez.

-- Selecciona la base de datos.
-- Asegúrate de que 'lista_tareas_db' coincida con el nombre de la base de datos en tu docker-compose.yml
USE lista_tareas_db;

-- Crea la tabla 'tareas' si no existe
CREATE TABLE IF NOT EXISTS tareas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    descripcion VARCHAR(255) NOT NULL,
    completada BOOLEAN DEFAULT FALSE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Opcional: Puedes añadir algunas tareas de ejemplo si quieres que aparezcan al iniciar la DB.
INSERT INTO tareas (descripcion) VALUES ('Comprar pan');
INSERT INTO tareas (descripcion, completada) VALUES ('Hacer ejercicio', TRUE);