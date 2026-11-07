# Apify Actor image. The base image already has Node 20, `apify` helpers and
# the right user for the platform.
FROM apify/actor-node:20

COPY package*.json ./
RUN npm --quiet set progress=false \
 && npm install --omit=dev --omit=optional \
 && echo "Node: $(node -v)" && echo "NPM: $(npm -v)"

COPY . ./

CMD ["npm", "start", "--silent"]
