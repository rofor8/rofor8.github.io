---
sidebar_position: 4
---

### Create a pod
``` bash
podman pod create -p 8080:8080 -p 5432:5432 -n geospatial
```

### Run image in pod
``` bash
podman run \
--pod geospatial \
--name postgis \
-e POSTGRES_PASSWORD=postgres \
-d postgis/postgis
```

### make directory for systemd
mkdir -p /home/$user/.config/systemd/user/

### auto gen systemd file
``` bash
podman generate systemd postgis > /home/$user/.config/systemd/user/postgis.service
```

### start postgis service
``` bash
systemctl start --user postgis.service
```

### enable postgis service
``` bash
systemctl enable --user postgis.service
```

### install psql
```
sudo dnf install psql
```

## Check
``` bash
psql -h localhost -p 5432 -U postgres 
```


## Upload income data

### create bank_statements database
psql -U postgres -h localhost -p 5432  -c  "CREATE DATABASE bank_statements;"

### create bank_statements tables
```
psql -U postgres -h localhost -p 5432 -d  bank_statements -c "CREATE TABLE transactions (date date, account_number int, sort_code int, debit float, credit float,type varchar(255), description varchar(255));"
```

### copy to container
``` bash
podman cp bank_statements.csv postgis:/bank_statements.csv
```

### enter psql
```
psql -U postgres -h localhost -p 5432 -d bank_statements
```

### copy data into bank_statements database
```
COPY transactions FROM '/bank_statements.csv' DELIMITER ',' CSV HEADER;
```

## Upload expense data

### create database
psql -U postgres -h localhost -p 5432  -c  "CREATE DATABASE ebay;"

### create tables
```
psql -U postgres -h localhost -p 5432 -d  ebay -c "CREATE TABLE transactions (date date, id float, title varchar(255), price float, quantity int, postage float,total float, currency varchar(255), seller varchar(255));"
```

### copy to container
``` bash
podman cp ebay.csv postgis:/ebay.csv
```

### enter psql
```
psql -U postgres -h localhost -p 5432 -d ebay
```

### copy data into database, and change date format
```
COPY transactions FROM '/ebay.csv' DELIMITER ',' CSV HEADER;
```

## Query income data


### open database
```
psql -U postgres -h localhost -p 5432 -d bank_statements
```


### select fiscal total income
``` sql
SELECT 
  EXTRACT(YEAR FROM date) AS year,
  SUM(credit) AS total_income
FROM
  transactions
WHERE
  EXTRACT(MONTH FROM date) >= 8 AND EXTRACT(DAY FROM date) >= 6
GROUP BY
  year
ORDER BY
  year;
  ```