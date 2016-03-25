# Requirements
This project uses [`node.js`](https://nodejs.org/) modules for bundling the content.  Make sure you download `node.js` v4.X.X from their [website](https://nodejs.org/en/download/).

# Installation
Install all dependencies:
```
npm install
```

# Hacking
Modify any file within the JS folder (do not alter bundle.js) and regenerate bundle.js using:

```
npm run bundle
```

During development you might want to automatically recompile the bundle using:

```
npm run watch
```

# Browsing
Open up the server to play around with your changes with:

```
npm start
```

Then hit http://localhost:8080/ in your browser and have at it!
