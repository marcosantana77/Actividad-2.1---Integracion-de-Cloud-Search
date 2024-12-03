const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { google } = require('googleapis');

const app = express();
const PORT = 8080;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // Para formularios
app.use(express.static('public2')); // Sirve la carpeta "public2"

// Configura el OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  '736378041434-q729pnvu58vnidcmtnf6oj73nonniu4q.apps.googleusercontent.com',
  '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',
  'http://localhost:8080/oauth2callback' // Cambia según tu entorno
);

const drive = google.drive({ version: 'v3', auth: oAuth2Client });

// Ruta para iniciar la autenticación
app.get('/auth', (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
  });
  res.redirect(authUrl);
});

// Callback después de la autenticación
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    res.send('Autenticación exitosa. Ahora puedes gestionar Google Drive.');
  } catch (error) {
    console.error('Error al obtener el token:', error);
    res.status(500).send('Error en la autenticación.');
  }
});

//----------------------------------------------------------GESTIÓN DE ARCHIVOS----------------------------------------------------------------------

const upload = multer({ dest: 'uploads/' }).single('file');

// Subir archivos a Google Drive
app.post('/upload', (req, res) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError || err) {
      return res.status(500).send('Error al subir archivo: ' + err.message);
    }

    if (!req.file) {
      return res.status(400).send('No se ha subido ningún archivo.');
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileMimeType = req.file.mimetype;  // Corregido aquí

    const fileMetadata = {
      name: fileName,
      parents: ['1IHCya6x9tqfhmW2Gk2ultIskmcR7-fUP'], // Asegúrate de que esta ID de carpeta sea válida
    };
    const media = {
      mimeType: fileMimeType,
      body: fs.createReadStream(filePath),
    };

    drive.files.create(
      { resource: fileMetadata, media: media, fields: 'id' },
      (err, file) => {
        fs.unlink(filePath, () => {}); // Borra el archivo temporal
        if (err) {
          return res.status(500).send('Error al subir archivo: ' + err.message);
        }
        res.send('Archivo subido con ID: ' + file.data.id);
      }
    );
  });
});

// Listar archivos en Drive
app.get('/list-files', async (req, res) => {
  try {
    const response = await drive.files.list({
      pageSize: 20,
      fields: 'files(id, name, mimeType, parents)',
    });
    res.json(response.data.files);
  } catch (error) {
    console.error('Error al listar archivos:', error);
    res.status(500).send('Error al listar archivos.');
  }
});

// Descargar archivos desde Drive
app.get('/download/:fileId/:fileName', async (req, res) => {
  const { fileId, fileName } = req.params;
  try {
    const fileStream = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    fileStream.data.pipe(res);
  } catch (error) {
    console.error('Error al descargar archivo:', error);
    res.status(500).send('Error al descargar archivo.');
  }
});

// Crear carpeta en Drive
app.post('/create-folder', async (req, res) => {
  const { folderName, parentId } = req.body;
  try {
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    };
    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });
    res.send('Carpeta creada con ID: ' + folder.data.id);
  } catch (error) {
    console.error('Error al crear carpeta:', error);
    res.status(500).send('Error al crear carpeta.');
  }
});

// Eliminar archivo de Drive
app.delete('/delete-file/:id', async (req, res) => {
  const fileId = req.params.id;
  try {
    await drive.files.delete({ fileId });
    res.send(`Archivo con ID ${fileId} eliminado con éxito.`);
  } catch (error) {
    console.error('Error al eliminar archivo:', error);
    res.status(500).send('Error al eliminar archivo.');
  }
});

//----------------------------------------------------------PÁGINA PRINCIPAL----------------------------------------------------------------------

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/public2/drive.html'));
});

//----------------------------------------------------------INICIO DEL SERVIDOR----------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
