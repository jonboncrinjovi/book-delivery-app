package main

import (
	"crypto/tls"
	"crypto/x509"
	"embed"
	"net/http"
	"time"
)

// Точка uses certificates from the Russian national CA (Минцифры), which standard systems don't trust.
// They're built into the program and added only for requests to Точка.
//
//go:embed certs/russian_trusted_root_ca_pem.crt certs/russian_trusted_sub_ca_pem.crt
var russianCAs embed.FS

var tochkaHTTP = func() *http.Client {
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	for _, f := range []string{"certs/russian_trusted_root_ca_pem.crt", "certs/russian_trusted_sub_ca_pem.crt"} {
		if b, err := russianCAs.ReadFile(f); err == nil {
			pool.AppendCertsFromPEM(b)
		}
	}
	return &http.Client{
		Timeout:   20 * time.Second,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool}},
	}
}()
