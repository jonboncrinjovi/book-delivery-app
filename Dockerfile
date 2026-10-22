# stage 1: full Go toolchain, used only for compiling
FROM golang:1 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app .

# stage 2: tiny image holding just binary, no shell, no compiler
FROM gcr.io/distroless/static-debian12
COPY --from=build /app /app
USER nonroot
EXPOSE 8080
ENTRYPOINT ["/app"]
