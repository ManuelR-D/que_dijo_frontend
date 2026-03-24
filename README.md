# ¿Qué dijo?

Este es el frontend de quedijo.ar. 

## Dependencias

Es necesario tener clonado el repositorio [Como_voto](https://github.com/rquiroga7/como_voto) dado que consume sus datos a partir del script  `extract_data.py`

También es necesario tener el backend [candidatos-back](https://github.com/ManuelR-D/candidatos-back) dado que consume su api el script

## Hosteo local con datos de este repo (standalone)

```
git clone https://github.com/ManuelR-D/que_dijo
cd ./que_dijo
npm install
npm run dev
```

## Host local desde cero

### Candidatos-backend

**Este paso no es necesario para hostear la página**, pero sirve para reproducir los datos que la página usa desde cero.
La página usa los datos en `./public/data` y este repo ya los tiene guardados. 

```
git clone https://github.com/ManuelR-D/candidatos-back
cd candidatos-back/src/bdd
docker-compose up -d
./import_representatives.ps1

cd ../
python install -r requirements.txt
python run_api_server.py
```

```
cd candidatos-back/sessions
# La ingesta iniciar puede tardar mucho tiempo! Incluye los resumenes hechos por IA. Requiere llenar el .env
./ingest.ps1 -Year 2025
./ingest.ps1 -Year 2026
```

### Como_voto

```
git clone https://github.com/rquiroga7/como_voto
```

Leer el repo de como_voto para entender cómo obtener los datos crudos. Esto no debería ser necesario puesto que actualiza sus datos cada 24 horas con la última votación, pero puede ser útil para reproducir los datos.

### Que dijo?

```
git clone https://github.com/ManuelR-D/que_dijo
cd ./que_dijo
python extract_data.py --year 2025
python extract_data.py --year 2026
python fetch_interventions.py --year 2025
python fetch_interventions.py --year 2026
python fetch_missing_photos.py
npm install
npm run dev
```
