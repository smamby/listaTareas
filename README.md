# listaTareas

## OPCION 1: Descarga solo este archivo para un despliegue automatico en local
#### Este script de bash clonara el repositorio, creara la imagen del backend, se conectara a la base de datos local y abrira el navegador con la url del proyecto.
#### Las variables de entorno para la base de datos esta en el script de conexion.
#### No requiere el .env
#### en caso de no conectarse, crear la base de datos manualmente

#### descarge el archivo deploy-dockerfile.sh

ejecutar script de bash   
./deploy-dockerfile.sh

## OPCION 2: Ejecute docker-compose automaticamente
### Con este script podra:   
#### 1) probar la aplicacion
#### 2) Correr test unitarios
#### 3) correr test de integracion
#### Clone el proyecto
git clone https://github.com/smamby/listaTareas.git
#### requiere tener el archivo .env en /
#### ejecute el script deploy-dev-test.sh
./deploy-dev-test.sh


## OPCION 3: Despliegue local manual
git clone https://github.com/smamby/listaTareas.git
npm install
npm run dev
npm run test
npm run test:integration


## OPCION 4: Despliegue con docker compose
### git clone https://github.com/smamby/listaTareas.git
### copy .env al / del proyecto
docker-compose up -d --build
winpty docker exec -it listatareas-app-1 bash
npm run test
npm run test:integration

