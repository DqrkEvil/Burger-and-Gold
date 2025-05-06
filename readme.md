# Så kör du Burger & Gold-projektet

## Förutsättningar
- Du måste ha **Node.js** installerat på din dator.  
  Ladda ner från: https://nodejs.org



## 1. Installera Express

```bash
npm init -y
npm install express
```

## 2. Starta servern

```bash
node server/server.js
```

## 3. Öppna i webbläsaren

```text
http://localhost:3000
```

Om du vill komma åt sidan från en annan enhet i samma nätverk (t.ex. mobil eller surfplatta), se den lokala IP-adressen som visas i terminalen, t.ex:

```text
→ Lokalt:   http://localhost:3000
→ Nätverk:  http://192.168.1.45:3000
```

## Felsökning

Om du får `MODULE_NOT_FOUND` eller liknande fel:
- Kontrollera att filen `server.js` ligger i mappen `server/`
- Kör kommandot `node server/server.js` (inte bara `node server`)
