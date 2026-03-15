FROM node:20-alpine
WORKDIR /app

# Copy only the compiled JS and production dependencies for the backend
COPY --from=backend-builder /app/server/dist ./dist
COPY --from=backend-builder /app/server/package*.json ./
RUN npm install --only=production

# Copy the built React files into a 'public' folder inside the backend
COPY --from=frontend-builder /app/client/build ./public

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080
ENV JWT_SECRET=528f207cef3a0a7b4e54c34618f6ae7cbc46f773e82f19c227d13670380928228f4fc95841fd28db97a67e029300a441559de947bc4de799f386a39ee537316b
ENV DB_HOST=db.syjzkhpnzgagcxtcuzum.supabase.co
ENV DB_PORT=5432
ENV DB_NAME=ediss_db
ENV DB_USER=postgres
ENV DB_PASSWORD=anuraag@1407

EXPOSE 8080



# Start the application using your start script: "node dist/index.js"
CMD ["npm", "start"]