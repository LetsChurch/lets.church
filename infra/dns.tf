resource "cloudflare_zone" "lets_church" {
  account_id = var.cloudflare_account_id
  zone       = "lets.church"
  plan       = "free"
  type       = "full"
}

resource "cloudflare_record" "txt_dmarc" {
  zone_id = cloudflare_zone.lets_church.id
  type    = "TXT"
  name    = "_dmarc.lets.church"
  value   = "v=DMARC1; p=none"
}

resource "cloudflare_record" "txt_spf" {
  zone_id = cloudflare_zone.lets_church.id
  type    = "TXT"
  name    = "lets.church"
  value   = "v=spf1 include:_spf.protonmail.ch mx ~all"
}

resource "cloudflare_record" "txt_verification" {
  zone_id = cloudflare_zone.lets_church.id
  type    = "TXT"
  name    = "lets.church"
  value   = "protonmail-verification=96f2e2415998d886de72bdf4b58d52a99c582407"
}

resource "cloudflare_record" "cname_pm1" {
  zone_id = cloudflare_zone.lets_church.id
  type    = "CNAME"
  name    = "protonmail._domainkey.lets.church"
  value   = "protonmail.domainkey.dfomeh4e6ebbywg4mcqdcu3nvh3tkbexmrtlekvred4tyfhovcunq.domains.proton.ch."
}

resource "cloudflare_record" "cname_pm2" {
  zone_id = cloudflare_zone.lets_church.id
  type    = "CNAME"
  name    = "protonmail2._domainkey.lets.church"
  value   = "protonmail2.domainkey.dfomeh4e6ebbywg4mcqdcu3nvh3tkbexmrtlekvred4tyfhovcunq.domains.proton.ch."
}

resource "cloudflare_record" "cname_pm3" {
  zone_id = cloudflare_zone.lets_church.id
  type    = "CNAME"
  name    = "protonmail3._domainkey.lets.church"
  value   = "protonmail3.domainkey.dfomeh4e6ebbywg4mcqdcu3nvh3tkbexmrtlekvred4tyfhovcunq.domains.proton.ch."
}

resource "cloudflare_record" "mx1" {
  zone_id  = cloudflare_zone.lets_church.id
  type     = "MX"
  name     = "lets.church"
  value    = "mail.protonmail.ch."
  priority = 10
}

resource "cloudflare_record" "mx2" {
  zone_id  = cloudflare_zone.lets_church.id
  type     = "MX"
  name     = "lets.church"
  value    = "mailsec.protonmail.ch."
  priority = 20
}

resource "cloudflare_record" "preview" {
  zone_id = cloudflare_zone.lets_church.id
  type    = "A"
  name    = "preview"
  value   = linode_nodebalancer.nginx_ingress.ipv4
  proxied = false
}

resource "cloudflare_zone" "letschurch_cloud" {
  account_id = var.cloudflare_account_id
  zone       = "letschurch.cloud"
  plan       = "free"
  type       = "full"
}

# Workers custom domain must currently be added manually: https://github.com/cloudflare/terraform-provider-cloudflare/issues/1921
