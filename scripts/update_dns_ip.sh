#!/bin/bash
current_ip=$(curl -s http://checkip.amazonaws.com/)
password=""
curl "https://dynamicdns.park-your-domain.com/update?host=labelstudio&domain=elifdev.com&password=${password}&ip=$current_ip" > /home/ubuntu/scripts/update_dns_ip.log
curl "https://dynamicdns.park-your-domain.com/update?host=labelstudio1&domain=elifdev.com&password=${password}&ip=$current_ip" > /home/ubuntu/scripts/update_dns_ip.log
