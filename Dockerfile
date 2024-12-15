FROM node:22.3.0

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    cairo \
    libcairo2-dev \
    libpango1.0-dev \
    libpng-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pixman \
    libpixman-1-dev \
    python3-setuptools \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (or npm-shrinkwrap.json) to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your bot's source code
COPY . .

# Command to run your bot
CMD ["node", "index.js"]
