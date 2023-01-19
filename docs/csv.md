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

### auto gen systemd file
``` bash
podman generate systemd postgis >
/home/$user/.config/systemd/user/postgis.service
```

### start postgis service
``` bash
systemctl start --user postgis.service
```

### enable postgis service
``` bash
systemctl start --user postgis.service
```

``` bash
podman start postgis
```
## Check
``` bash
psql -h localhost -p 5432 -U postgres 
```


sudo dnf install psql
psql -U postgres -c -h 0.0.0.0 -p 5432 "CREATE DATABASE bank_statements;"
psql -U postgres -d -h 0.0.0.0 -p 5432   bank_statements -c "CREATE TABLE transactions (date date, account_number int, sort_code int, amount int, type varchar(255), description varchar(255));"