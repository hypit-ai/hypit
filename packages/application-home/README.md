# `@hypit/application-home`

Application Home is the application-level browser Surface for one `ApplicationHost`. It projects registered products,
active projects, Product Sessions and selected AIGC Execution Environments. Launching a product temporarily leases the selected
Project Boundary, creates the Product Session and releases the temporary lease; the Product Session then retains its
own ProjectHost lifetime.

The package owns a browser artifact and its Node static adapter. It does not own Project, NLE, Canvas or Scene facts,
and it does not interpret product launch values beyond the parameters declared by each registered Product Provider.
