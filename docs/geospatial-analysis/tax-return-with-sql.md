---
sidebar_position: 1
---

# Setting up Postgres Database Server

### Create a pod
``` bash
podman pod create -p 8080:8080 -p 5432:5432 -n tax
```

### Run image in pod
``` bash
podman run \
--pod tax \
--name postgres \
-e POSTGRES_PASSWORD=postgres \
-d postgres
```

### auto gen systemd file
``` bash
podman generate systemd postgis >
/home/$user/.config/systemd/user/postgres.service
```

### start postgis service
``` bash
systemctl start --user postgres.service
```

### enable postgis service
``` bash
systemctl start --user postgres.service
```

``` bash
podman start postgres
```
## Check
``` bash
psql -h localhost -p 5432 -U postgres 
```

