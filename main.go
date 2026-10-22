package main

import (
   "context"
   "log"
   "net/http"
   "os"
   "time"

   "github.com/jackc/pgx/v5/pgxpool"
)

func main() {
   // pool of reusable DB connections; address comes from an env variable, not hardcoded
   pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
   if err != nil {
      log.Fatal(err)
   }
   defer pool.Close()

   // health check: answers "ok" only if the database responds within 2 seconds
   http.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
      ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
      defer cancel()
      if err := pool.Ping(ctx); err != nil {
         http.Error(w, "db down: "+err.Error(), http.StatusServiceUnavailable)
         return
      }
      w.Write([]byte("ok\n"))
   })

   log.Println("listening on :8080")
   log.Fatal(http.ListenAndServe(":8080", nil))
}
